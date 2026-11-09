#!/usr/bin/env python3
"""Ping the Java server and update the published status only when it changes."""

import json
import socket
import struct
import time
from datetime import datetime, timezone
from pathlib import Path

HOST = "tayronstadt.aternos.me"
PORT = 62855
STATUS_FILE = Path("public/server-status.json")


def write_varint(number):
    number &= 0xFFFFFFFF
    result = bytearray()
    while True:
        byte = number & 0x7F
        number >>= 7
        result.append(byte | (0x80 if number else 0))
        if not number:
            return bytes(result)


def read_varint(stream):
    value = 0
    shift = 0
    while shift < 35:
        raw = stream.recv(1)
        if not raw:
            raise ConnectionError("server closed the connection")
        byte = raw[0]
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value
        shift += 7
    raise ValueError("invalid Minecraft VarInt")


def read_exact(stream, length):
    result = bytearray()
    while len(result) < length:
        chunk = stream.recv(length - len(result))
        if not chunk:
            raise ConnectionError("server closed the connection")
        result.extend(chunk)
    return bytes(result)


def ping():
    address = HOST.encode("utf-8")
    handshake = b"\x00" + write_varint(767) + write_varint(len(address)) + address
    handshake += struct.pack(">H", PORT) + b"\x01"
    packet = write_varint(len(handshake)) + handshake + b"\x01\x00"

    with socket.create_connection((HOST, PORT), timeout=7) as stream:
        stream.settimeout(7)
        stream.sendall(packet)
        read_varint(stream)  # response packet length
        if read_varint(stream) != 0:
            raise ValueError("unexpected status packet")
        response_length = read_varint(stream)
        response = json.loads(read_exact(stream, response_length).decode("utf-8"))

    players = response.get("players", {})
    return {"online": True, "players": players.get("online")}


def main():
    result = None
    refused = 0
    for attempt in range(3):
        try:
            result = ping()
            break
        except ConnectionRefusedError:
            refused += 1
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        if attempt < 2:
            time.sleep(3)

    # A refused port on all attempts is a confirmed offline result. Timeouts or
    # other network errors are inconclusive, so don't falsely mark Aternos down.
    if result is None:
        if refused == 3:
            result = {"online": False, "players": None}
        else:
            result = {"online": None, "players": None}

    previous = {}
    if STATUS_FILE.exists():
        previous = json.loads(STATUS_FILE.read_text(encoding="utf-8"))

    if previous.get("online") == result["online"] and previous.get("players") == result["players"]:
        print("Status unchanged")
        print("changed=false")
        return

    result["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))
    print("changed=true")


if __name__ == "__main__":
    main()
