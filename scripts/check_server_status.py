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


def ping(ip):
    address = HOST.encode("utf-8")
    handshake = b"\x00" + write_varint(767) + write_varint(len(address)) + address
    handshake += struct.pack(">H", PORT) + b"\x01"
    packet = write_varint(len(handshake)) + handshake + b"\x01\x00"

    with socket.create_connection((ip, PORT), timeout=4) as stream:
        stream.settimeout(4)
        stream.sendall(packet)
        read_varint(stream)  # response packet length
        if read_varint(stream) != 0:
            raise ValueError("unexpected status packet")
        response_length = read_varint(stream)
        response = json.loads(read_exact(stream, response_length).decode("utf-8"))

    version = response.get("version", {})
    version_name = str(version.get("name", "")).lower()
    if version.get("protocol") == -1 or "offline" in version_name:
        return {"online": False, "players": None}
    players = response.get("players", {})
    return {
        "online": True,
        "players": {"online": players.get("online"), "max": players.get("max")},
    }


def main():
    outcomes = []
    refused = 0
    try:
        addresses = sorted({
            item[4][0]
            for item in socket.getaddrinfo(HOST, PORT, type=socket.SOCK_STREAM)
            if item[0] == socket.AF_INET
        })
    except OSError:
        addresses = []

    for ip in addresses:
        try:
            outcomes.append(ping(ip))
        except ConnectionRefusedError:
            refused += 1
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        time.sleep(1)

    online_count = sum(item["online"] for item in outcomes)
    offline_count = len(outcomes) - online_count
    if online_count > len(addresses) / 2:
        result = next(item for item in outcomes if item["online"])
    elif offline_count + refused > len(addresses) / 2 and addresses:
        result = {"online": False, "players": None}
    elif not addresses and refused:
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
