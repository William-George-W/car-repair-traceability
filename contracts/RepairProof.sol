// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Stores the verifiable summary of a vehicle repair certificate.
 * Full repair details remain off-chain; only the digest and key timestamps
 * are recorded here.
 */
contract RepairProof {
    address public owner;
    mapping(address => bool) public repairShops;

    struct Proof {
        string certificateNo;
        string vehicleNo;
        bytes32 dataHash;
        uint256 repairTime;
        uint256 warrantyStart;
        uint256 warrantyEnd;
        address repairShop;
        bool revoked;
        bool exists;
    }

    mapping(string => Proof) private proofs;

    event RepairShopUpdated(address indexed repairShop, bool enabled);
    event RepairProofAdded(
        string indexed certificateNo,
        string vehicleNo,
        bytes32 dataHash,
        address indexed repairShop,
        uint256 repairTime,
        uint256 warrantyEnd
    );
    event RepairProofRevoked(string indexed certificateNo, address indexed operator);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyRepairShop() {
        require(repairShops[msg.sender], "only repair shop");
        _;
    }

    constructor() {
        owner = msg.sender;
        repairShops[msg.sender] = true;
        emit RepairShopUpdated(msg.sender, true);
    }

    function setRepairShop(address repairShop, bool enabled) external onlyOwner {
        require(repairShop != address(0), "invalid repair shop");
        repairShops[repairShop] = enabled;
        emit RepairShopUpdated(repairShop, enabled);
    }

    function addRepairProof(
        string calldata certificateNo,
        string calldata vehicleNo,
        bytes32 dataHash,
        uint256 repairTime,
        uint256 warrantyStart,
        uint256 warrantyEnd
    ) external onlyRepairShop {
        require(bytes(certificateNo).length > 0, "certificate required");
        require(bytes(vehicleNo).length > 0, "vehicle required");
        require(dataHash != bytes32(0), "hash required");
        require(!proofs[certificateNo].exists, "certificate already exists");
        require(warrantyEnd >= warrantyStart, "invalid warranty period");

        proofs[certificateNo] = Proof({
            certificateNo: certificateNo,
            vehicleNo: vehicleNo,
            dataHash: dataHash,
            repairTime: repairTime,
            warrantyStart: warrantyStart,
            warrantyEnd: warrantyEnd,
            repairShop: msg.sender,
            revoked: false,
            exists: true
        });

        emit RepairProofAdded(
            certificateNo,
            vehicleNo,
            dataHash,
            msg.sender,
            repairTime,
            warrantyEnd
        );
    }

    function getRepairProof(string calldata certificateNo)
        external
        view
        returns (Proof memory)
    {
        require(proofs[certificateNo].exists, "certificate not found");
        return proofs[certificateNo];
    }

    function verifyRepairProof(string calldata certificateNo, bytes32 dataHash)
        external
        view
        returns (bool)
    {
        Proof memory proof = proofs[certificateNo];
        return proof.exists && !proof.revoked && proof.dataHash == dataHash;
    }

    function revokeRepairProof(string calldata certificateNo) external {
        Proof storage proof = proofs[certificateNo];
        require(proof.exists, "certificate not found");
        require(msg.sender == owner || msg.sender == proof.repairShop, "not authorized");
        require(!proof.revoked, "certificate already revoked");

        proof.revoked = true;
        emit RepairProofRevoked(certificateNo, msg.sender);
    }
}
