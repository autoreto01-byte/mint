// mint.js — Front-end mint helper for Monad (EVM)
// Requires: include ethers v6 in your HTML:
// <script src="https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js"></script>

(() => {
  // ============== CONFIG ==============
  const CONTRACT_ADDRESS = "0xca15ac41f4b330ef8b14f90eb7f633b59529f64c";

  // Mint price you requested: 0.0000001 MON per mint
  // (MON has 18 decimals like ETH)
  const MINT_PRICE_MON = "0.0000001";

  // Monad Mainnet
  const MONAD_CHAIN_ID_DEC = 143; // Monad Mainnet chain id :contentReference[oaicite:1]{index=1}
  const MONAD_CHAIN_ID_HEX = "0x8f"; // 143 in hex
  const MONAD_PARAMS = {
    chainId: MONAD_CHAIN_ID_HEX,
    chainName: "Monad Mainnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: ["https://rpc.monad.xyz"],
    blockExplorerUrls: ["https://monadscan.com"],
  };

  // ---- Choose ONE mint signature that matches your contract ----
  // Most common NFT mints:
  const MINT_METHODS = [
    // 1) mint(uint256 quantity)
    { label: "mint(uint256)", fragment: "function mint(uint256 quantity) payable", fn: "mint", args: (qty, to) => [qty] },

    // 2) publicMint(uint256 quantity)
    { label: "publicMint(uint256)", fragment: "function publicMint(uint256 quantity) payable", fn: "publicMint", args: (qty, to) => [qty] },

    // 3) mint(address to, uint256 quantity)
    { label: "mint(address,uint256)", fragment: "function mint(address to, uint256 quantity) payable", fn: "mint", args: (qty, to) => [to, qty] },

    // 4) mint()  (single mint)
    { label: "mint()", fragment: "function mint() payable", fn: "mint", args: (qty, to) => [] },

    // 5) publicMint()  (single mint)
    { label: "publicMint()", fragment: "function publicMint() payable", fn: "publicMint", args: (qty, to) => [] },
  ];

  // Default pick (change if needed)
  let SELECTED_INDEX = 0;

  // ============== Minimal UI helpers (optional) ==============
  function byId(id) { return document.getElementById(id); }
  function setStatus(msg) {
    const el = byId("status");
    if (el) el.textContent = msg;
    console.log(msg);
  }

  async function ensureMonadNetwork() {
    if (!window.ethereum) throw new Error("No EVM wallet found (window.ethereum missing). Install MetaMask/Rabby/OKX/etc.");

    const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
    if (currentChainId?.toLowerCase() === MONAD_CHAIN_ID_HEX) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_CHAIN_ID_HEX }],
      });
    } catch (err) {
      // If chain not added yet
      if (err && (err.code === 4902 || ("" + err.message).toLowerCase().includes("unrecognized chain"))) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [MONAD_PARAMS],
        });
      } else {
        throw err;
      }
    }
  }

  async function connectWallet() {
    await ensureMonadNetwork();

    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    setStatus(`Connected: ${address} (Monad chainId ${MONAD_CHAIN_ID_DEC})`);
    return { provider, signer, address };
  }

  function getContract(signer) {
    const method = MINT_METHODS[SELECTED_INDEX];
    const abi = [method.fragment];
    return new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
  }

  async function mint(qty) {
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be a positive number.");

    const { signer, address } = await connectWallet();

    const method = MINT_METHODS[SELECTED_INDEX];
    const contract = getContract(signer);

    const priceWei = ethers.parseEther(MINT_PRICE_MON);
    const value = priceWei * BigInt(qty); // total cost

    setStatus(`Minting ${qty} ... using ${method.label} | value=${ethers.formatEther(value)} MON`);

    // Build args depending on signature
    const args = method.args(qty, address);

    // Send tx
    let tx;
    try {
      tx = await contract[method.fn](...args, { value });
    } catch (e) {
      // Helpful error hint
      throw new Error(
        `Mint call failed with method ${method.label}. This usually means the contract uses a different mint function/signature, or has extra requirements (whitelist, max mint, paused, etc.).\n` +
        `Original error: ${e?.shortMessage || e?.message || e}`
      );
    }

    setStatus(`Tx sent: ${tx.hash} (waiting confirmation...)`);
    const receipt = await tx.wait();
    setStatus(`✅ Mint confirmed in block ${receipt.blockNumber}. Tx: ${tx.hash}`);
    return receipt;
  }

  // ============== Expose functions & optional UI wiring ==============
  window.MonadMint = {
    setMethod(index) {
      if (index < 0 || index >= MINT_METHODS.length) throw new Error("Invalid method index.");
      SELECTED_INDEX = index;
      setStatus(`Selected mint method: ${MINT_METHODS[SELECTED_INDEX].label}`);
    },
    listMethods() {
      return MINT_METHODS.map((m, i) => ({ i, label: m.label }));
    },
    connectWallet,
    mint,
  };

  // If you have buttons/inputs in HTML, auto-wire them:
  document.addEventListener("DOMContentLoaded", () => {
    const connectBtn = byId("connectBtn");
    const mintBtn = byId("mintBtn");
    const qtyInput = byId("qty");
    const methodSelect = byId("method");

    if (methodSelect) {
      methodSelect.innerHTML = MINT_METHODS
        .map((m, i) => `<option value="${i}" ${i === SELECTED_INDEX ? "selected" : ""}>${m.label}</option>`)
        .join("");
      methodSelect.addEventListener("change", (e) => {
        SELECTED_INDEX = parseInt(e.target.value, 10);
        setStatus(`Selected mint method: ${MINT_METHODS[SELECTED_INDEX].label}`);
      });
    }

    if (connectBtn) connectBtn.addEventListener("click", () => connectWallet().catch(e => setStatus("❌ " + e.message)));
    if (mintBtn) mintBtn.addEventListener("click", () => {
      const qty = qtyInput ? parseInt(qtyInput.value || "1", 10) : 1;
      mint(qty).catch(e => setStatus("❌ " + e.message));
    });

    // Initial status
    setStatus("Ready. Call window.MonadMint.mint(qty) or use the UI buttons.");
  });
})();
