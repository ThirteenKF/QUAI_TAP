// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GameMessenger - on-chain chat: global room + per-wallet rooms.
contract GameMessenger {
    uint256 public constant MAX_TEXT_LENGTH = 180;
    bytes32 public constant GLOBAL_ROOM = bytes32(0);

    struct Message {
        address author;
        uint64 timestamp;
        bytes32 roomKey;
        string text;
    }

    Message[] private _messages;

    event MessagePosted(
        uint256 indexed id,
        address indexed author,
        bytes32 indexed roomKey,
        uint64 timestamp,
        string text
    );

    function postMessage(bytes32 roomKey, string calldata text) external {
        bytes memory raw = bytes(text);
        uint256 len = raw.length;
        require(len > 0, "Messenger: empty message");
        require(len <= MAX_TEXT_LENGTH, "Messenger: message too long");
        require(
            roomKey == GLOBAL_ROOM || roomKey == _walletRoomKey(msg.sender),
            "Messenger: invalid room"
        );

        uint64 ts = uint64(block.timestamp);
        uint256 id = _messages.length;
        _messages.push(
            Message({
                author: msg.sender,
                timestamp: ts,
                roomKey: roomKey,
                text: text
            })
        );
        emit MessagePosted(id, msg.sender, roomKey, ts, text);
    }

    function totalMessages() external view returns (uint256) {
        return _messages.length;
    }

    function getMessage(uint256 id) external view returns (Message memory) {
        require(id < _messages.length, "Messenger: bad id");
        return _messages[id];
    }

    function getRecentMessages(
        bytes32 roomKey,
        uint256 limit
    ) external view returns (Message[] memory out) {
        if (limit == 0) {
            return new Message[](0);
        }

        uint256 total = _messages.length;
        if (total == 0) {
            return new Message[](0);
        }

        uint256 cap = limit > total ? total : limit;
        out = new Message[](cap);

        uint256 idx = total;
        uint256 written = 0;
        while (idx > 0 && written < cap) {
            unchecked {
                idx -= 1;
            }
            Message storage m = _messages[idx];
            if (m.roomKey != roomKey) {
                continue;
            }
            out[written] = m;
            unchecked {
                written += 1;
            }
        }

        assembly {
            mstore(out, written)
        }

        for (uint256 i = 0; i < written / 2; ) {
            Message memory tmp = out[i];
            uint256 j = written - 1 - i;
            out[i] = out[j];
            out[j] = tmp;
            unchecked {
                i += 1;
            }
        }
    }

    function walletRoomKey(address wallet) external pure returns (bytes32) {
        return _walletRoomKey(wallet);
    }

    function _walletRoomKey(address wallet) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(wallet));
    }
}
