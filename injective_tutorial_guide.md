# Building a Spot Trading Interface on Injective Protocol

A comprehensive tutorial for creating a React-based spot trading application using the Injective TypeScript SDK.

## Table of Contents
- [Prerequisites](#prerequisites)
- [What You'll Build](#what-youll-build)
- [Project Overview](#project-overview)
- [Step 1: Project Setup & SDK Integration](#step-1-project-setup--sdk-integration)
- [Step 2: Wallet Connection](#step-2-wallet-connection)
- [Step 3: Market Data & Selection](#step-3-market-data--selection)
- [Step 4: Real-time Order Book](#step-4-real-time-order-book)
- [Step 5: Trading Form Implementation](#step-5-trading-form-implementation)
- [Step 6: Order Placement & Transaction Signing](#step-6-order-placement--transaction-signing)
- [Step 7: User Account Data](#step-7-user-account-data)
- [Step 8: Adding Styling & Polish](#step-8-adding-styling--polish)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)
- [Conclusion](#conclusion)

## Prerequisites

Before starting this tutorial, ensure you have:

- **Node.js 18+** installed
- **React knowledge** (hooks, state management, effects)
- **MetaMask wallet** installed and configured
- **Basic trading concepts** understanding (market/limit orders, order books)
- **TypeScript familiarity** (helpful but not required)

## What You'll Build

By the end of this tutorial, you'll have a fully functional spot trading interface featuring:

- **Wallet Integration**: Connect MetaMask wallets to Injective Protocol
- **Market Selection**: Choose from available spot trading pairs
- **Live Order Book**: Real-time buy/sell order display with streaming updates
- **Trading Interface**: Place market and limit orders with proper validation
- **Account Management**: View token balances and active positions
- **Transaction Handling**: Sign and broadcast transactions through MetaMask

## Project Overview

### Architecture
- **Frontend**: React with TypeScript
- **Blockchain**: Injective Protocol (Testnet)
- **Wallet**: MetaMask integration
- **Real-time Data**: WebSocket streaming for order book updates

### Key Technologies
- `@injectivelabs/sdk-ts` - Main SDK for blockchain interactions
- `@injectivelabs/networks` - Network configuration
- React hooks for state management
- CSS for styling

---

## Step 1: Project Setup & SDK Integration

### 1.1 Initialize the Project

```bash
npx create-react-app injective-trading --template typescript
cd injective-trading
```

### 1.2 Install Dependencies

```bash
npm install @injectivelabs/sdk-ts @injectivelabs/networks
```

### 1.3 Configure Network Endpoints

Create the basic app structure in `App.tsx`:

```typescript
import {
  getInjectiveAddress,
  IndexerGrpcSpotApi,
  IndexerGrpcSpotStream,
  ChainRestBankApi,
  ChainGrpcExchangeApi,
  MsgCreateSpotLimitOrder,
  MsgCreateSpotMarketOrder,
  getEthereumAddress,
  getSpotMarketTensMultiplier,
  spotPriceToChainPriceToFixed,
  spotQuantityToChainQuantityToFixed,
  ChainRestAuthApi,
  createTransaction,
  getDefaultSubaccountId,
  TxRestApi,
} from "@injectivelabs/sdk-ts";
import { getNetworkEndpoints, Network } from "@injectivelabs/networks";
import { useState, useEffect, useRef } from "react";

function App() {
  // Initialize Injective API clients
  const endpoints = getNetworkEndpoints(Network.Testnet);
  const indexerGrpcSpotApi = new IndexerGrpcSpotApi(endpoints.indexer);
  const indexerGrpcSpotStream = new IndexerGrpcSpotStream(endpoints.indexer);
  const chainRestBankApi = new ChainRestBankApi(endpoints.rest);
  const chainGrpcExchangeApi = new ChainGrpcExchangeApi(endpoints.grpc);
  const restEndpoint = getNetworkEndpoints(Network.Testnet).rest;

  return <div>Injective Trading Interface</div>;
}

export default App;
```

### Key Points:
- **Network.Testnet** is used for development - switch to `Network.Mainnet` for production
- Each API client handles different functionality (spot markets, streaming, balances, etc.)
- Import only the specific functions you need to keep bundle size manageable

---

## Step 2: Wallet Connection

### 2.1 Define State Variables

Add wallet connection state to your App component:

```typescript
const [isConnected, setIsConnected] = useState(false);
const [addresses, setAddresses] = useState<string[]>([]);
const [injectiveAddresses, setInjectiveAddresses] = useState<string[]>([]);
const [error, setError] = useState<string>("");
```

### 2.2 Implement Wallet Connection Logic

```typescript
// Utility function to access MetaMask
const getEthereum = () => {
  if (!window.ethereum) {
    throw new Error("Metamask extension not installed");
  }
  return window.ethereum;
};

const connectWallet = async () => {
  try {
    setError("");
    const ethereum = getEthereum();
    
    // Request account access
    const evmAddresses = await ethereum.request({
      method: "eth_requestAccounts",
    });

    // Convert EVM addresses to Injective addresses
    const injAddresses = evmAddresses.map(getInjectiveAddress);

    setAddresses(evmAddresses);
    setInjectiveAddresses(injAddresses);
    setIsConnected(true);

    console.log("EVM Addresses:", evmAddresses);
    console.log("Injective Addresses:", injAddresses);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to connect wallet");
    setIsConnected(false);
  }
};

const disconnectWallet = () => {
  setIsConnected(false);
  setAddresses([]);
  setInjectiveAddresses([]);
  setError("");
};
```

### 2.3 Create Wallet UI Component

```typescript
// Helper function for formatting addresses
const formatAddress = (address: string) => {
  if (!address) return "";
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
};

// Add this to your JSX return
<header className="header">
  <div className="header-container">
    <div className="logo">
      <h2>Injective Trading</h2>
    </div>
    {!isConnected ? (
      <button className="connect-button" onClick={connectWallet}>
        Connect Wallet
      </button>
    ) : (
      <div className="wallet-info-header">
        <div className="connected-address">
          <span className="address-label">Connected:</span>
          <span className="address-text" title={injectiveAddresses[0] || ""}>
            {formatAddress(injectiveAddresses[0] || "")}
          </span>
        </div>
        <button className="disconnect-button" onClick={disconnectWallet}>
          Disconnect
        </button>
      </div>
    )}
  </div>
</header>
```

### Key Points
- **Address Conversion**: EVM addresses from MetaMask must be converted to Injective format
- **Error Handling**: Always wrap wallet interactions in try-catch blocks
- **State Management**: Keep wallet connection state synchronized

---

## Step 3: Market Data & Selection

### 3.1 Define Market Data Types

```typescript
interface TradingPair {
  marketId: string;
  ticker: string;
  baseDenom: string;
  quoteDenom: string;
  marketStatus: string;
  makerFeeRate: string;
  takerFeeRate: string;
  serviceProviderFee: string;
  minNotional: number;
  minPriceTickSize: number;
  minQuantityTickSize: number;
  baseToken?: {
    name: string;
    symbol: string;
    decimals: number;
    logo?: string;
    address?: string;
    coinGeckoId?: string;
  };
  quoteToken?: {
    name: string;
    symbol: string;
    decimals: number;
    logo?: string;
    address?: string;
    coinGeckoId?: string;
    tokenType?: string;
  };
}
```

### 3.2 Add Market State Variables

```typescript
const [selectedPair, setSelectedPair] = useState<string>("");
const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
const [marketsLoading, setMarketsLoading] = useState(true);
const [marketsError, setMarketsError] = useState<string>("");
```

### 3.3 Fetch Available Markets

```typescript
useEffect(() => {
  const fetchMarkets = async () => {
    try {
      setMarketsLoading(true);
      setMarketsError("");

      console.log("Fetching markets from Injective testnet...");
      const markets = await indexerGrpcSpotApi.fetchMarkets();
      console.log("Markets fetched:", markets);

      // Format markets for display
      const formattedMarkets: TradingPair[] = markets.map((market) => ({
        marketId: market.marketId,
        ticker: market.ticker,
        baseDenom: market.baseDenom,
        quoteDenom: market.quoteDenom,
        marketStatus: market.marketStatus,
        makerFeeRate: market.makerFeeRate,
        takerFeeRate: market.takerFeeRate,
        serviceProviderFee: market.serviceProviderFee,
        minNotional: market.minNotional,
        minPriceTickSize: market.minPriceTickSize,
        minQuantityTickSize: market.minQuantityTickSize,
        baseToken: market.baseToken,
        quoteToken: market.quoteToken,
      }));

      setTradingPairs(formattedMarkets);

      // Set default selected pair
      if (formattedMarkets.length > 0 && !selectedPair) {
        setSelectedPair(formattedMarkets[0].ticker);
      }
    } catch (err) {
      console.error("Error fetching markets:", err);
      setMarketsError(
        err instanceof Error ? err.message : "Failed to fetch markets"
      );
    } finally {
      setMarketsLoading(false);
    }
  };

  fetchMarkets();
}, []);
```

### 3.4 Market Selector UI

```typescript
<div className="market-selector">
  <div className="market-selector-container">
    <h3>MARKET SELECTOR</h3>
    {marketsLoading ? (
      <div className="loading-message">Loading markets...</div>
    ) : marketsError ? (
      <div className="error-message" style={{ color: "red", margin: "10px 0" }}>
        Error loading markets: {marketsError}
      </div>
    ) : (
      <div className="market-controls">
        <div className="pair-dropdown">
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="pair-select"
            disabled={tradingPairs.length === 0}
          >
            {tradingPairs.map((pair) => (
              <option key={pair.marketId} value={pair.ticker}>
                {pair.ticker} ({pair.marketStatus})
              </option>
            ))}
          </select>
        </div>
      </div>
    )}
  </div>
</div>
```

### 3.5 Helper Function

```typescript
const getCurrentPairData = () => {
  return (
    tradingPairs.find((pair) => pair.ticker === selectedPair) ||
    tradingPairs[0]
  );
};
```

### Key Points
- **Market Data Structure**: Understanding the complete market object structure is crucial
- **Error Handling**: Always handle loading and error states for better UX
- **Default Selection**: Set a default market to prevent undefined state

---

## Step 4: Real-time Order Book

### 4.1 Define Order Book Types

```typescript
interface OrderBookEntry {
  price: string;
  quantity: string;
  timestamp: number;
}
```

### 4.2 Add Order Book State

```typescript
const [buyOrders, setBuyOrders] = useState<OrderBookEntry[]>([]);
const [sellOrders, setSellOrders] = useState<OrderBookEntry[]>([]);
const [orderbookLoading, setOrderbookLoading] = useState(true);
const [currentPrice, setCurrentPrice] = useState<number>(0);
const streamRef = useRef<any>(null);
```

### 4.3 Implement Order Book Streaming

```typescript
useEffect(() => {
  if (!selectedPair || tradingPairs.length === 0) return;

  const currentMarket = getCurrentPairData();
  if (!currentMarket) return;

  console.log("Starting orderbook stream for market:", currentMarket.marketId);
  setOrderbookLoading(true);

  const streamFn = indexerGrpcSpotStream.streamSpotOrderbookV2.bind(
    indexerGrpcSpotStream
  );

  const callback = (orderbooks: any) => {
    console.log("Orderbook update received:", orderbooks);
    
    try {
      let orderbook = null;

      // Handle different possible data structures
      if (orderbooks?.orderbook) {
        orderbook = orderbooks.orderbook;
      } else if (
        orderbooks &&
        Array.isArray(orderbooks) &&
        orderbooks.length > 0 &&
        orderbooks[0]?.orderbook
      ) {
        orderbook = orderbooks[0].orderbook;
      } else if (orderbooks?.buys || orderbooks?.sells) {
        orderbook = orderbooks;
      } else {
        orderbook = orderbooks;
      }

      if (orderbook && (orderbook.buys || orderbook.sells)) {
        // Process buy orders (bids)
        const processedBuyOrders: OrderBookEntry[] = orderbook.buys
          ? orderbook.buys
              .slice(0, 10) // Show top 10 levels
              .map((order: any, index: number) => ({
                price: order.price,
                quantity: order.quantity,
                timestamp: order.timestamp || Date.now(),
              }))
          : [];

        // Process sell orders (asks)
        const processedSellOrders: OrderBookEntry[] = orderbook.sells
          ? orderbook.sells
              .slice(0, 10) // Show top 10 levels
              .map((order: any, index: number) => ({
                price: order.price,
                quantity: order.quantity,
                timestamp: order.timestamp || Date.now(),
              }))
          : [];

        setBuyOrders(processedBuyOrders);
        setSellOrders(processedSellOrders);
        
        // Update current price (middle of bid-ask spread)
        if (processedBuyOrders.length > 0 && processedSellOrders.length > 0) {
          const bestBid = parseFloat(processedBuyOrders[0].price);
          const bestAsk = parseFloat(processedSellOrders[0].price);
          setCurrentPrice((bestBid + bestAsk) / 2);
        }
        
        setOrderbookLoading(false);
      } else {
        setOrderbookLoading(false);
      }
    } catch (err) {
      console.error("Error processing orderbook data:", err);
      setOrderbookLoading(false);
    }
  };

  const streamFnArgs = {
    marketIds: [currentMarket.marketId],
    callback,
  };

  try {
    streamRef.current = streamFn(streamFnArgs);
  } catch (err) {
    console.error("Error starting orderbook stream:", err);
    setOrderbookLoading(false);
  }

  // Cleanup function
  return () => {
    if (streamRef.current) {
      console.log("Cleaning up orderbook stream");
      streamRef.current = null;
    }
  };
}, [selectedPair, tradingPairs]);
```

### 4.4 Order Book UI Component

```typescript
const handlePriceClick = (clickedPrice: string) => {
  setPrice(clickedPrice);
};

// In your JSX:
<div className="order-book">
  <h3>ORDER BOOK</h3>

  {orderbookLoading ? (
    <div className="loading-message">Loading orderbook...</div>
  ) : (
    <>
      {/* Sell Orders */}
      <div className="sell-orders">
        <div className="order-header">
          <span>Price</span>
          <span>Quantity</span>
        </div>
        {sellOrders
          .slice()
          .reverse()
          .map((order, index) => (
            <div
              key={`sell-${index}`}
              className="order-row sell-order"
              onClick={() => handlePriceClick(order.price)}
            >
              <span className="price">
                {parseFloat(order.price).toFixed(6)}
              </span>
              <span className="quantity">
                {parseFloat(order.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        {sellOrders.length === 0 && (
          <div className="no-orders">No sell orders</div>
        )}
      </div>

      {/* Current Price */}
      <div className="current-price">
        <span>CURRENT: ${currentPrice.toFixed(3)}</span>
      </div>

      {/* Buy Orders */}
      <div className="buy-orders">
        {buyOrders.map((order, index) => (
          <div
            key={`buy-${index}`}
            className="order-row buy-order"
            onClick={() => handlePriceClick(order.price)}
          >
            <span className="price">
              {parseFloat(order.price).toFixed(6)}
            </span>
            <span className="quantity">
              {parseFloat(order.quantity).toFixed(2)}
            </span>
          </div>
        ))}
        {buyOrders.length === 0 && (
          <div className="no-orders">No buy orders</div>
        )}
      </div>
    </>
  )}
</div>
```

### Key Points
- **Data Streaming**: Real-time updates require proper WebSocket handling
- **Data Processing**: Order book data may come in different formats
- **User Interaction**: Clicking prices auto-fills the trading form
- **Cleanup**: Always clean up streaming connections to prevent memory leaks

---

## Step 5: Trading Form Implementation

### 5.1 Define Trading State

```typescript
type OrderSide = "buy" | "sell";
type OrderType = "market" | "limit";

const [orderSide, setOrderSide] = useState<OrderSide>("buy");
const [orderType, setOrderType] = useState<OrderType>("limit");
const [price, setPrice] = useState<string>("");
const [quantity, setQuantity] = useState<string>("");
```

### 5.2 Form Validation and Calculations

```typescript
const calculateTotal = () => {
  const priceNum = parseFloat(price || "0");
  const quantityNum = parseFloat(quantity || "0");
  return (priceNum * quantityNum).toFixed(2);
};

// Clear order messages when form values change
useEffect(() => {
  if (orderError || orderSuccess) {
    clearOrderMessages();
  }
}, [price, quantity, orderSide, orderType, selectedPair]);
```

### 5.3 Trading Form UI

```typescript
<div className="trading-form">
  <h3>TRADING FORM</h3>

  {/* Buy/Sell Tabs */}
  <div className="order-side-tabs">
    <button
      className={`tab ${orderSide === "buy" ? "active" : ""}`}
      onClick={() => setOrderSide("buy")}
    >
      BUY
    </button>
    <button
      className={`tab ${orderSide === "sell" ? "active" : ""}`}
      onClick={() => setOrderSide("sell")}
    >
      SELL
    </button>
  </div>

  {/* Order Type Toggle */}
  <div className="order-type-toggle">
    <label>Order Type:</label>
    <div className="radio-group">
      <label>
        <input
          type="radio"
          value="market"
          checked={orderType === "market"}
          onChange={() => setOrderType("market")}
        />
        Market
      </label>
      <label>
        <input
          type="radio"
          value="limit"
          checked={orderType === "limit"}
          onChange={() => setOrderType("limit")}
        />
        Limit
      </label>
    </div>
  </div>

  {/* Price Input */}
  <div className="input-group">
    <label>Price</label>
    <input
      type="number"
      value={price}
      onChange={(e) => setPrice(e.target.value)}
      disabled={orderType === "market"}
      placeholder="0.000"
      step="0.001"
    />
  </div>

  {/* Quantity Input */}
  <div className="input-group">
    <label>Quantity</label>
    <input
      type="number"
      value={quantity}
      onChange={(e) => setQuantity(e.target.value)}
      placeholder="0.000"
      step="0.001"
    />
  </div>

  {/* Total Calculation */}
  <div className="total-display">
    <span>Total: ${calculateTotal()}</span>
  </div>

  {/* Place Order Button */}
  <button
    className={`place-order-btn ${orderSide}`}
    onClick={handlePlaceOrder}
    disabled={
      isPlacingOrder ||
      !quantity ||
      (orderType === "limit" && !price) ||
      !isConnected
    }
  >
    {isPlacingOrder ? (
      <span>Placing Order...</span>
    ) : (
      `Place ${orderSide.toUpperCase()} Order`
    )}
  </button>

  {/* Connection Warning */}
  {!isConnected && (
    <div style={{ padding: "0.5rem 1rem", textAlign: "center", fontSize: "0.8rem", color: "#666", fontStyle: "italic" }}>
      Connect wallet to place orders
    </div>
  )}
</div>
```

### Key Points

- **Form Validation**: Disable order button when required fields are empty
- **Real-time Calculations**: Update total as user types
- **User Feedback**: Clear visual states for different order types

---

## Step 6: Order Placement & Transaction Signing

### 6.1 Add Order State Variables

```typescript
const [isPlacingOrder, setIsPlacingOrder] = useState(false);
const [orderError, setOrderError] = useState<string>("");
const [orderSuccess, setOrderSuccess] = useState<string>("");
```

### 6.2 Implement Order Placement Logic

```typescript
const handlePlaceOrder = async () => {
  if (!price && orderType === "limit") return;
  if (!quantity) return;
  if (!isConnected || injectiveAddresses.length === 0) {
    setOrderError("Please connect your wallet first");
    return;
  }

  const currentMarket = getCurrentPairData();
  if (!currentMarket) {
    setOrderError("Please select a market first");
    return;
  }

  try {
    setIsPlacingOrder(true);
    setOrderError("");
    setOrderSuccess("");

    const injectiveAddress = injectiveAddresses[0];

    // Get market details for order creation
    const market = {
      marketId: currentMarket.marketId,
      baseDecimals: currentMarket.baseToken?.decimals || 18,
      quoteDecimals: currentMarket.quoteToken?.decimals || 6,
      minPriceTickSize: currentMarket.minPriceTickSize,
      minQuantityTickSize: currentMarket.minQuantityTickSize,
    };

    // Get market multipliers for proper conversion
    const tensMultipliers = getSpotMarketTensMultiplier({
      baseDecimals: market.baseDecimals,
      quoteDecimals: market.quoteDecimals,
      minPriceTickSize: market.minPriceTickSize,
      minQuantityTickSize: market.minQuantityTickSize,
    });
    
    const marketWithMultipliers = {
      ...market,
      priceTensMultiplier: tensMultipliers.priceTensMultiplier,
      quantityTensMultiplier: tensMultipliers.quantityTensMultiplier,
    };

    // Create subaccount ID
    const ethereumAddress = getEthereumAddress(injectiveAddress);
    const subaccountIndex = 0;
    const suffix = "0".repeat(23) + subaccountIndex;
    const subaccountId = ethereumAddress + suffix;

    // Determine order type (1 = Buy, 2 = Sell)
    const orderTypeValue = orderSide === "buy" ? 1 : 2;
    const feeRecipient = injectiveAddress;

    let msg;

    if (orderType === "limit") {
      // Convert price and quantity to chain format
      const chainPrice = spotPriceToChainPriceToFixed({
        value: parseFloat(price),
        tensMultiplier: marketWithMultipliers.priceTensMultiplier,
        baseDecimals: marketWithMultipliers.baseDecimals,
        quoteDecimals: marketWithMultipliers.quoteDecimals,
      });

      const chainQuantity = spotQuantityToChainQuantityToFixed({
        value: parseFloat(quantity),
        tensMultiplier: marketWithMultipliers.quantityTensMultiplier,
        baseDecimals: marketWithMultipliers.baseDecimals,
      });

      // Create limit order
      msg = MsgCreateSpotLimitOrder.fromJSON({
        subaccountId,
        injectiveAddress,
        orderType: orderTypeValue,
        price: chainPrice,
        quantity: chainQuantity,
        marketId: marketWithMultipliers.marketId,
        feeRecipient: feeRecipient,
      });
    } else {
      // Create market order
      const marketPrice = orderSide === "buy"
        ? sellOrders.length > 0 ? parseFloat(sellOrders[0].price) : parseFloat(price || "0")
        : buyOrders.length > 0 ? parseFloat(buyOrders[0].price) : parseFloat(price || "0");

      const chainPrice = spotPriceToChainPriceToFixed({
        value: marketPrice,
        tensMultiplier: marketWithMultipliers.priceTensMultiplier,
        baseDecimals: marketWithMultipliers.baseDecimals,
        quoteDecimals: marketWithMultipliers.quoteDecimals,
      });

      const chainQuantity = spotQuantityToChainQuantityToFixed({
        value: parseFloat(quantity),
        tensMultiplier: marketWithMultipliers.quantityTensMultiplier,
        baseDecimals: marketWithMultipliers.baseDecimals,
      });

      msg = MsgCreateSpotMarketOrder.fromJSON({
        subaccountId,
        injectiveAddress,
        orderType: orderTypeValue,
        price: chainPrice,
        quantity: chainQuantity,
        marketId: marketWithMultipliers.marketId,
        feeRecipient: feeRecipient,
      });
    }

    // Get account details for transaction creation
    const accountDetailsApi = new ChainRestAuthApi(endpoints.rest);
    const accountDetails = await accountDetailsApi.fetchAccount(injectiveAddress);

    const baseAccount = accountDetails.account.base_account || accountDetails.account;
    const pubKey = baseAccount.pub_key?.key || "";
    const sequence = parseInt(baseAccount.sequence, 10);
    const accountNumber = parseInt(baseAccount.account_number, 10);

    // Create transaction
    const { signBytes, txRaw } = createTransaction({
      message: msg,
      memo: `${orderType.toUpperCase()} ${orderSide.toUpperCase()} order via Injective Trading App`,
      fee: {
        amount: [{ amount: "400000000000000000", denom: "inj" }], // 0.4 INJ
        gas: "400000",
      },
      pubKey: pubKey,
      sequence: sequence,
      accountNumber: accountNumber,
      chainId: "injective-888", // Testnet chain ID
    });

    // Sign transaction with MetaMask
    const ethereum = getEthereum();
    const signBytesHex = "0x" + Buffer.from(signBytes).toString("hex");

    const signature = await ethereum.request({
      method: "personal_sign",
      params: [signBytesHex, addresses[0]],
    });

    // Create signed transaction
    const signedTxRaw = {
      ...txRaw,
      signatures: [Buffer.from(signature.slice(2), "hex")],
    };

    // Broadcast transaction
    const txRestApi = new TxRestApi(restEndpoint);
    const txResponse = await txRestApi.broadcast(signedTxRaw);
    const response = await txRestApi.fetchTxPoll(txResponse.txHash);
    
    console.log("Transaction response:", response);

    setOrderSuccess(`✅ Order placed successfully!
                    Market: ${currentMarket.ticker}
                    Type: ${orderType.toUpperCase()} ${orderSide.toUpperCase()}
                    Quantity: ${quantity}
                    ${orderType === "limit" ? `Price: ${price}` : "Market Order"}
                    
                    Transaction Hash: ${txResponse.txHash}`);

    // Clear form
    setPrice("");
    setQuantity("");

    // Refresh user data
    setTimeout(() => {
      refreshUserData();
    }, 2000);

  } catch (err) {
    console.error("Error placing order:", err);
    setOrderError(err instanceof Error ? err.message : "Failed to place order");
  } finally {
    setIsPlacingOrder(false);
  }
};
```

### 6.3 Message Display Components

```typescript
const clearOrderMessages = () => {
  setOrderError("");
  setOrderSuccess("");
};

// Add to your trading form JSX:
{orderError && (
  <div className="order-error" style={{
    padding: "0.5rem 1rem",
    background: "#fee",
    color: "#c53030",
    fontSize: "0.85rem",
    borderRadius: "4px",
    margin: "0.5rem 1rem",
    border: "1px solid #fed7d7",
  }}>
    <strong>Error:</strong> {orderError}
    <button onClick={clearOrderMessages} style={{
      float: "right",
      background: "none",
      border: "none",
      color: "#c53030",
      cursor: "pointer",
      fontSize: "0.8rem",
    }}>
      ✕
    </button>
  </div>
)}

{orderSuccess && (
  <div className="order-success" style={{
    padding: "0.5rem 1rem",
    background: "#f0fff4",
    color: "#22543d",
    fontSize: "0.8rem",
    borderRadius: "4px",
    margin: "0.5rem 1rem",
    border: "1px solid #9ae6b4",
    whiteSpace: "pre-line",
  }}>
    <strong>Success:</strong> {orderSuccess}
    <button onClick={clearOrderMessages} style={{
      float: "right",
      background: "none",
      border: "none",
      color: "#22543d",
      cursor: "pointer",
      fontSize: "0.8rem",
    }}>
      ✕
    </button>
  </div>
)}
```

### Key Points

- **Price/Quantity Conversion**: Critical for proper order execution on-chain
- **Transaction Creation**: Requires account details (sequence, account number, public key)
- **MetaMask Signing**: Convert sign bytes to hex format for compatibility
- **Error Handling**: Comprehensive error states and user feedback
- **Transaction Broadcasting**: Use proper REST API endpoints

## Step 7: User Account Data

### 7.1 Define Account Data Types

```typescript
interface TokenBalance {
  symbol: string;
  amount: number;
  usdValue?: number;
  denom?: string;
}

interface Position {
  subaccountId: string;
  marketId: string;
  direction: string;
  quantity: string;
  entryPrice: string;
  margin: string;
  liquidationPrice: string;
  markPrice: string;
  ticker?: string;
}
```

### 7.2 Add Account State Variables

```typescript
const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
const [positions, setPositions] = useState<Position[]>([]);
const [balancesLoading, setBalancesLoading] = useState(false);
const [positionsLoading, setPositionsLoading] = useState(false);
const [userPanelError, setUserPanelError] = useState<string>("");
```

### 7.3 Fetch User Balances

```typescript
const fetchUserBalances = async (injectiveAddress: string) => {
  try {
    setBalancesLoading(true);
    setUserPanelError("");

    console.log("Fetching balances for address:", injectiveAddress);
    const balancesResponse = await chainRestBankApi.fetchBalances(injectiveAddress);
    console.log("Raw balances:", balancesResponse);

    const balancesArray = balancesResponse.balances || [];
    const formattedBalances: TokenBalance[] = balancesArray
      .map((balance: any) => {
        // Convert amount from base units
        const amount = parseFloat(balance.amount) / Math.pow(10, 18);

        // Extract symbol from denom
        let symbol = balance.denom;

        if (balance.denom.startsWith("factory/")) {
          const parts = balance.denom.split("/");
          symbol = parts[parts.length - 1] || balance.denom;
        } else if (balance.denom.startsWith("ibc/")) {
          symbol = "IBC/" + balance.denom.substring(4, 12) + "...";
        } else if (balance.denom.startsWith("peggy0x")) {
          symbol = "PEGGY/" + balance.denom.substring(7, 15) + "...";
        } else if (balance.denom === "inj") {
          symbol = "INJ";
        }

        // Ensure symbol is not longer than 12 characters
        if (symbol.length > 12) {
          symbol = symbol.substring(0, 9) + "...";
        }

        return {
          symbol,
          amount,
          denom: balance.denom,
          usdValue: 0,
        };
      })
      .filter((balance) => balance.amount > 0);

    setTokenBalances(formattedBalances);
  } catch (err) {
    console.error("Error fetching balances:", err);
    setUserPanelError(
      `Failed to fetch balances: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  } finally {
    setBalancesLoading(false);
  }
};
```

### 7.4 Fetch User Positions

```typescript
const fetchUserPositions = async (injectiveAddress: string) => {
  try {
    setPositionsLoading(true);
    setUserPanelError("");

    const subaccountId = getDefaultSubaccountId(injectiveAddress);

    // Fetch orders instead of positions for spot trading
    const orders = await indexerGrpcSpotApi.fetchSubaccountOrdersList({
      subaccountId,
    });

    // For demonstration, we can also try to fetch positions
    try {
      const positionsResponse = await chainGrpcExchangeApi.fetchPositions();
      console.log("Raw positions:", positionsResponse);

      const positionsArray = Array.isArray(positionsResponse) ? positionsResponse : [];
      const userPositions = positionsArray.filter((position: any) => {
        if (position.subaccountId && position.subaccountId.includes(injectiveAddress.replace("inj", ""))) {
          return true;
        }
        return true;
      });

      const formattedPositions: Position[] = userPositions
        .filter((position: any) => position && position.marketId)
        .map((position: any) => {
          const market = tradingPairs.find((pair) => pair.marketId === position.marketId);

          return {
            subaccountId: position.subaccountId || "",
            marketId: position.marketId,
            direction: position.direction || "unknown",
            quantity: position.quantity || "0",
            entryPrice: position.entryPrice || "0",
            margin: position.margin || "0",
            liquidationPrice: position.liquidationPrice || "0",
            markPrice: position.markPrice || "0",
            ticker: market?.ticker || (position.marketId ? position.marketId.substring(0, 8) + "..." : "Unknown"),
          };
        })
        .filter((position: Position) => position.quantity !== "0");

      setPositions(formattedPositions);
    } catch (positionError) {
      console.log("Position fetching failed, this might be normal if no positions exist:", positionError);
      setPositions([]);
    }
  } catch (err) {
    console.error("Error in fetchUserPositions:", err);
    setUserPanelError(
      `Failed to fetch positions: ${err instanceof Error ? err.message : "Unknown error"}`
    );
    setPositions([]);
  } finally {
    setPositionsLoading(false);
  }
};
```

### 7.5 Auto-fetch User Data

```typescript
// Fetch user data when wallet is connected
useEffect(() => {
  if (isConnected && injectiveAddresses.length > 0) {
    const primaryAddress = injectiveAddresses[0];
    console.log("Fetching user data for address:", primaryAddress);
    
    fetchUserBalances(primaryAddress);
    fetchUserPositions(primaryAddress);
  }
}, [isConnected, injectiveAddresses, tradingPairs]);
```

### 7.6 User Panel UI

```typescript
const refreshUserData = () => {
  if (isConnected && injectiveAddresses.length > 0) {
    const primaryAddress = injectiveAddresses[0];
    fetchUserBalances(primaryAddress);
    fetchUserPositions(primaryAddress);
  }
};

// User Panel JSX:
<div className="user-panel">
  <div className="user-panel-header" style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  }}>
    <h3>USER PANEL</h3>
    {isConnected && (
      <button
        onClick={refreshUserData}
        style={{
          fontSize: "12px",
          padding: "4px 8px",
          background: "#0066cc",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
        disabled={balancesLoading || positionsLoading}
      >
        Refresh
      </button>
    )}
  </div>

  {userPanelError && (
    <div className="error-message" style={{ color: "red", fontSize: "12px", margin: "5px 0" }}>
      {userPanelError}
    </div>
  )}

  {!isConnected && (
    <div className="connect-prompt" style={{
      textAlign: "center",
      padding: "20px",
      color: "#666",
    }}>
      Connect your wallet to view balances and positions
    </div>
  )}

  {isConnected && (
    <>
      {/* Token Balances */}
      <div className="balances-section">
        <h4>
          BALANCES{" "}
          {balancesLoading && (
            <span style={{ fontSize: "12px", color: "#666" }}>
              (Loading...)
            </span>
          )}
        </h4>
        <div className="balance-header">
          <span>Token</span>
          <span>Amount</span>
        </div>
        {tokenBalances.length > 0 ? (
          tokenBalances.map((balance, index) => (
            <div key={index} className="balance-row">
              <span
                className="token"
                title={`Full name: ${balance.denom}`}
                style={{
                  cursor: "help",
                  borderBottom: balance.symbol.includes("...") ? "1px dotted #666" : "none",
                }}
              >
                {balance.symbol}
              </span>
              <span className="amount">{balance.amount.toFixed(6)}</span>
            </div>
          ))
        ) : (
          <div className="no-balances" style={{ color: "#666", fontSize: "12px" }}>
            {balancesLoading ? "Loading balances..." : "No balances found"}
          </div>
        )}
      </div>

      {/* Active Positions */}
      <div className="active-orders-section">
        <h4>
          ACTIVE POSITIONS{" "}
          {positionsLoading && (
            <span style={{ fontSize: "12px", color: "#666" }}>
              (Loading...)
            </span>
          )}
        </h4>
        <div className="orders-header">
          <span>Market</span>
          <span>Side</span>
          <span>Size</span>
        </div>
        {positions.length > 0 ? (
          positions.map((position, index) => (
            <div key={index} className="active-order-row">
              <span className="market" title={position.marketId} style={{ fontSize: "11px" }}>
                {position.ticker}
              </span>
              <span className={`side ${position.direction?.toLowerCase() || "unknown"}`}>
                {position.direction === "long"
                  ? "LONG"
                  : position.direction === "short"
                  ? "SHORT"
                  : position.direction?.toUpperCase() || "UNKNOWN"}
              </span>
              <span className="size" style={{ fontSize: "11px" }}>
                {parseFloat(position.quantity || "0").toFixed(2)}
              </span>
            </div>
          ))
        ) : (
          <div className="no-orders" style={{ color: "#666", fontSize: "12px" }}>
            {positionsLoading ? "Loading positions..." : "No active positions"}
          </div>
        )}
      </div>
    </>
  )}
</div>
```

### Key Points

- **Balance Formatting**: Handle different token denominations and display formats
- **Subaccount Management**: Use proper subaccount ID generation
- **Data Refresh**: Allow manual refresh of user data
- **Error States**: Handle cases where data fetching fails

---

## Step 8: Adding Styling & Polish

### 8.1 Create CSS Styles

Create a new file `App.css` and add comprehensive styling:

```css
/* App.css */
.App {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #f5f5f5;
}

/* Header Styles */
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.connect-button {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.3s;
}

.connect-button:hover {
  background: #45a049;
}

.disconnect-button {
  background: #f44336;
  color: white;
  border: none;
  padding: 0.3rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.3s;
}

.disconnect-button:hover {
  background: #da190b;
}

.wallet-info-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.connected-address {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.address-text {
  font-family: monospace;
  background: rgba(255, 255, 255, 0.2);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

/* Main Layout */
.main-container {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

/* Market Selector */
.market-selector {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.market-selector h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.1rem;
}

.pair-select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

/* Order Book */
.order-book {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.order-book h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.1rem;
}

.order-header {
  display: flex;
  justify-content: space-between;
  font-weight: bold;
  color: #666;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

.order-row {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0.5rem;
  margin: 0.1rem 0;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background-color 0.2s;
}

.order-row:hover {
  background: rgba(0, 0, 0, 0.05);
}

.buy-order {
  color: #4CAF50;
}

.sell-order {
  color: #f44336;
}

.current-price {
  text-align: center;
  padding: 0.5rem;
  margin: 0.5rem 0;
  background: #f0f0f0;
  border-radius: 4px;
  font-weight: bold;
  color: #333;
}

/* Trading Form */
.trading-form {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.trading-form h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.1rem;
}

.order-side-tabs {
  display: flex;
  margin-bottom: 1rem;
}

.tab {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  background: #f8f9fa;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}

.tab:first-child {
  border-radius: 4px 0 0 4px;
}

.tab:last-child {
  border-radius: 0 4px 4px 0;
}

.tab.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.order-type-toggle {
  margin-bottom: 1rem;
}

.radio-group {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.input-group {
  margin-bottom: 1rem;
}

.input-group label {
  display: block;
  margin-bottom: 0.3rem;
  font-weight: 500;
  color: #555;
}

.input-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.input-group input:disabled {
  background-color: #f5f5f5;
  color: #666;
}

.total-display {
  text-align: center;
  font-weight: bold;
  margin: 1rem 0;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
}

.place-order-btn {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s;
}

.place-order-btn.buy {
  background: #4CAF50;
  color: white;
}

.place-order-btn.buy:hover:not(:disabled) {
  background: #45a049;
}

.place-order-btn.sell {
  background: #f44336;
  color: white;
}

.place-order-btn.sell:hover:not(:disabled) {
  background: #da190b;
}

.place-order-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* User Panel */
.user-panel {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-top: 2rem;
}

.user-panel h3 {
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.1rem;
}

.balance-header,
.orders-header {
  display: flex;
  justify-content: space-between;
  font-weight: bold;
  color: #666;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid #eee;
}

.balance-row,
.active-order-row {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0.5rem;
  margin: 0.1rem 0;
  font-size: 0.85rem;
  border-radius: 3px;
}

.balance-row:nth-child(even),
.active-order-row:nth-child(even) {
  background: rgba(0, 0, 0, 0.02);
}

.side.long {
  color: #4CAF50;
  font-weight: bold;
}

.side.short {
  color: #f44336;
  font-weight: bold;
}

.side.unknown {
  color: #666;
}

/* Loading and Error States */
.loading-message {
  text-align: center;
  padding: 1rem;
  color: #666;
  font-style: italic;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 0.75rem;
  border-radius: 4px;
  border: 1px solid #ffcdd2;
  margin: 1rem 0;
}

.no-orders,
.no-balances {
  text-align: center;
  padding: 1rem;
  color: #999;
  font-style: italic;
  font-size: 0.8rem;
}

/* Responsive Design */
@media (max-width: 768px) {
  .main-container {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .header-container {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  
  .wallet-info-header {
    flex-direction: column;
    gap: 0.5rem;
  }
}

@media (max-width: 480px) {
  .App {
    padding: 10px;
  }
  
  .header {
    padding: 1rem;
  }
  
  .radio-group {
    flex-direction: column;
    gap: 0.5rem;
  }
}
```

### 8.2 Import CSS in App.tsx

```typescript
import './App.css';
```

### Key Points

- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Professional Look**: Clean, modern interface with proper spacing
- **User Feedback**: Clear visual states for loading, errors, and success
- **Accessibility**: Good contrast ratios and intuitive interactions

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Wallet Connection Issues
**Problem**: "MetaMask extension not installed" error
**Solution**: 
```typescript
// Add proper error handling
const getEthereum = () => {
  if (typeof window === 'undefined') {
    throw new Error("Window object not available");
  }
  if (!window.ethereum) {
    throw new Error("MetaMask extension not installed. Please install MetaMask first.");
  }
  return window.ethereum;
};
```

#### 2. Market Data Loading Issues
**Problem**: Markets fail to load or show empty results
**Solution**: Check network connection and add retry logic:
```typescript
const fetchMarketsWithRetry = async (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const markets = await indexerGrpcSpotApi.fetchMarkets();
      return markets;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

#### 3. Order Book Streaming Issues
**Problem**: Order book not updating or connection drops
**Solution**: Add connection status monitoring:
```typescript
const [streamStatus, setStreamStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

// In your streaming effect:
const callback = (orderbooks: any) => {
  setStreamStatus('connected');
  // ... rest of callback logic
};

// Add reconnection logic
useEffect(() => {
  const reconnectInterval = setInterval(() => {
    if (streamStatus === 'disconnected' && selectedPair) {
      console.log('Attempting to reconnect order book stream...');
      // Restart streaming logic
    }
  }, 5000);

  return () => clearInterval(reconnectInterval);
}, [streamStatus, selectedPair]);
```

#### 4. Transaction Signing Issues
**Problem**: Transaction signing fails or returns invalid signature
**Solution**: Ensure proper data formatting:
```typescript
// Verify sign bytes format
console.log('Sign bytes length:', signBytes.length);
console.log('Sign bytes hex:', Buffer.from(signBytes).toString('hex'));

// Check MetaMask connection before signing
const accounts = await ethereum.request({ method: 'eth_accounts' });
if (accounts.length === 0) {
  throw new Error('No MetaMask accounts connected');
}
```

#### 5. Price/Quantity Conversion Issues
**Problem**: Orders fail due to incorrect price/quantity format
**Solution**: Add validation and logging:
```typescript
const validateOrderInputs = (price: string, quantity: string, market: any) => {
  const priceNum = parseFloat(price);
  const quantityNum = parseFloat(quantity);
  
  if (priceNum <= 0 || quantityNum <= 0) {
    throw new Error('Price and quantity must be greater than 0');
  }
  
  if (priceNum < market.minPriceTickSize) {
    throw new Error(`Price must be at least ${market.minPriceTickSize}`);
  }
  
  if (quantityNum < market.minQuantityTickSize) {
    throw new Error(`Quantity must be at least ${market.minQuantityTickSize}`);
  }
  
  return { priceNum, quantityNum };
};
```

### Debug Tips

1. **Console Logging**: Use extensive console logging during development
2. **Network Tab**: Check browser network tab for failed API requests
3. **MetaMask Console**: Check MetaMask console for wallet-related errors
4. **Testnet Funds**: Ensure you have testnet INJ tokens for gas fees
5. **Market Status**: Verify selected market is active and trading

---

## Next Steps

### Immediate Improvements

1. **Styling Enhancement**
   - Add responsive design for mobile devices
   - Implement dark/light theme toggle
   - Add loading spinners and skeleton screens

2. **Error Handling**
   - Add retry mechanisms for failed requests
   - Implement offline detection
   - Add user-friendly error messages

3. **Performance Optimization**
   - Implement data caching
   - Add request debouncing for form inputs
   - Optimize re-renders with React.memo

### Advanced Features

1. **Order Management**
   - Add order history display
   - Implement order cancellation
   - Add partial fill tracking

2. **Chart Integration**
   - Add price charts using TradingView or similar
   - Implement candlestick data visualization
   - Add technical indicators

3. **Portfolio Management**
   - Add portfolio value calculation
   - Implement P&L tracking
   - Add performance analytics

4. **Advanced Trading Features**
   - Stop-loss and take-profit orders
   - OCO (One-Cancels-Other) orders
   - Advanced order types

### Production Considerations

1. **Security**
   - Input validation and sanitization
   - Rate limiting for API calls
   - Secure key management

2. **Monitoring**
   - Error tracking (Sentry, LogRocket)
   - Performance monitoring
   - User analytics

3. **Testing**
   - Unit tests for utility functions
   - Integration tests for trading flows
   - End-to-end testing with Playwright

4. **Deployment**
   - CI/CD pipeline setup
   - Environment configuration
   - Load balancing for production

### Resources

- [Injective Protocol Documentation](https://docs.injective.network/)
- [TypeScript SDK Reference](https://docs.injective.network/developers/sdk/ts)
- [React Best Practices](https://react.dev/learn)
- [MetaMask Developer Documentation](https://docs.metamask.io/)

---

## Conclusion

You now have a complete spot trading interface for Injective Protocol! This tutorial covered:

- ✅ Wallet integration with MetaMask
- ✅ Real-time market data fetching
- ✅ Live order book streaming
- ✅ Order placement with proper validation
- ✅ Transaction signing and broadcasting
- ✅ User account management

The foundation you've built can be extended with additional features like order history, advanced chart integration, and portfolio analytics. Remember to test thoroughly on testnet before deploying to mainnet, and always prioritize user experience and security in your implementation.

Happy trading on Injective!
