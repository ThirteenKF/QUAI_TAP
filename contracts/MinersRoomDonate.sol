// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Miners Room — перевод любого количества нативной монеты (QUAI) на фиксированный кошелёк.
contract MinersRoomDonate {
    /// Получатель пожертвований (Miners Room).
    address public constant RECIPIENT =
        0x006a2868356044940BEb8773B0ca13a2b0A4AF62;

    event Donation(address indexed from, uint256 amount);

    /// Пересылает весь `msg.value` на `RECIPIENT`.
    function donate() external payable {
        require(msg.value > 0, "MinersRoom: zero value");
        (bool ok, ) = payable(RECIPIENT).call{value: msg.value}("");
        require(ok, "MinersRoom: transfer failed");
        emit Donation(msg.sender, msg.value);
    }
}
