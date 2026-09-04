import { expect } from "chai";
import { ethers } from "hardhat";

describe("RepairProof", function () {
  async function deployFixture() {
    const [owner, repairShop, other] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("RepairProof");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return { contract, owner, repairShop, other };
  }

  const proofInput = {
    certificateNo: "CERT20260001",
    vehicleNo: "CAR20260001",
    dataHash: ethers.keccak256(ethers.toUtf8Bytes("repair-record-1")),
    repairTime: 1_753_500_000,
    warrantyStart: 1_753_500_000,
    warrantyEnd: 1_785_036_000
  };

  it("allows an authorized repair shop to add and verify a proof", async function () {
    const { contract, repairShop } = await deployFixture();
    await contract.setRepairShop(repairShop.address, true);

    await expect(
      contract.connect(repairShop).addRepairProof(
        proofInput.certificateNo,
        proofInput.vehicleNo,
        proofInput.dataHash,
        proofInput.repairTime,
        proofInput.warrantyStart,
        proofInput.warrantyEnd
      )
    ).to.emit(contract, "RepairProofAdded");

    const proof = await contract.getRepairProof(proofInput.certificateNo);
    expect(proof.vehicleNo).to.equal(proofInput.vehicleNo);
    expect(proof.dataHash).to.equal(proofInput.dataHash);
    expect(proof.repairShop).to.equal(repairShop.address);
    expect(await contract.verifyRepairProof(proofInput.certificateNo, proofInput.dataHash)).to.equal(true);
  });

  it("rejects duplicate certificates and unauthorized writers", async function () {
    const { contract, other } = await deployFixture();

    await expect(
      contract.connect(other).addRepairProof(
        proofInput.certificateNo,
        proofInput.vehicleNo,
        proofInput.dataHash,
        proofInput.repairTime,
        proofInput.warrantyStart,
        proofInput.warrantyEnd
      )
    ).to.be.revertedWith("only repair shop");

    await contract.addRepairProof(
      proofInput.certificateNo,
      proofInput.vehicleNo,
      proofInput.dataHash,
      proofInput.repairTime,
      proofInput.warrantyStart,
      proofInput.warrantyEnd
    );

    await expect(
      contract.addRepairProof(
        proofInput.certificateNo,
        proofInput.vehicleNo,
        proofInput.dataHash,
        proofInput.repairTime,
        proofInput.warrantyStart,
        proofInput.warrantyEnd
      )
    ).to.be.revertedWith("certificate already exists");
  });

  it("invalidates a revoked proof", async function () {
    const { contract } = await deployFixture();
    await contract.addRepairProof(
      proofInput.certificateNo,
      proofInput.vehicleNo,
      proofInput.dataHash,
      proofInput.repairTime,
      proofInput.warrantyStart,
      proofInput.warrantyEnd
    );

    await expect(contract.revokeRepairProof(proofInput.certificateNo))
      .to.emit(contract, "RepairProofRevoked");
    expect(await contract.verifyRepairProof(proofInput.certificateNo, proofInput.dataHash)).to.equal(false);
    expect((await contract.getRepairProof(proofInput.certificateNo)).revoked).to.equal(true);
  });

  it("rejects an invalid warranty period", async function () {
    const { contract } = await deployFixture();

    await expect(
      contract.addRepairProof(
        proofInput.certificateNo,
        proofInput.vehicleNo,
        proofInput.dataHash,
        proofInput.repairTime,
        proofInput.warrantyEnd,
        proofInput.warrantyStart
      )
    ).to.be.revertedWith("invalid warranty period");
  });
});
