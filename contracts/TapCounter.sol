// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TapCounter — партия ровно 10 тапов: +10 к счёту и перевод ровно 10 нативных монет (QUAI) получателю.
contract TapCounter {
    /// Получатель комиссии (10 QUAI за партию).
    address public constant FEE_RECIPIENT =
        0x006a2868356044940BEb8773B0ca13a2b0A4AF62;

    uint256 public constant TAP_BATCH = 10;
    /// 10 QUAI при 18 decimals (как ETH).
    uint256 public constant FEE_PER_BATCH = 10 ether;

    mapping(address => uint256) public totalTaps;

    event TenTapsCommitted(address indexed player, uint256 newTotal);

    /// Записывает 10 тапов для msg.sender и пересылает весь msg.value получателю.
    function commitTenTapsAndPay() external payable {
        require(msg.value == FEE_PER_BATCH, "need 10 QUAI");
        totalTaps[msg.sender] += TAP_BATCH;
        (bool ok, ) = payable(FEE_RECIPIENT).call{value: msg.value}("");
        require(ok, "transfer failed");
        emit TenTapsCommitted(msg.sender, totalTaps[msg.sender]);
    }
}
