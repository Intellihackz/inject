import "./App.css";
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

interface OrderBookEntry {
  price: string;
  quantity: string;
  timestamp: number;
}

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

type OrderSide = "buy" | "sell";
type OrderType = "market" | "limit";

declare global {
  interface Window {
    ethereum: any;
  }
}

const getEthereum = () => {
  if (!window.ethereum) {
    throw new Error("Metamask extension not installed");
  }

  return window.ethereum;
};

// Format small prices with leading zero compression (like DexScreener)
// Pass quoteSymbol to display the correct currency (INJ, USDT, etc.)
const formatSmallPrice = (price: number, quoteSymbol: string = "$"): string => {
  if (price === 0) return `${quoteSymbol}0.00`;
  if (price >= 0.0001) {
    return `${price.toFixed(4)}`;
  }
  
  // Convert to string to count leading zeros
  const priceStr = price.toFixed(20).replace(/\.?0+$/, ''); // Remove trailing zeros
  const match = priceStr.match(/^0\.0+/);
  
  if (!match) return `${price}`;
  
  const leadingZeros = match[0].length - 2; // Subtract "0."
  
  // Limit to max 9 leading zeros before showing 0.0₉ format
  if (leadingZeros > 9) {
    // For 10+ zeros, use scientific notation or show as 0.0₉ with adjusted significant digits
    const adjustedZeros = Math.min(leadingZeros, 9);
    const startPos = match[0].length + (leadingZeros - adjustedZeros);
    const significantDigits = priceStr.slice(startPos).slice(0, 4);
    
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    const zeroCount = adjustedZeros.toString().split('').map(d => subscripts[parseInt(d)]).join('');
    
    return `0.0${zeroCount}${significantDigits}`;
  }
  
  const significantDigits = priceStr.slice(match[0].length).slice(0, 4);
  
  // Use subscript numbers: ₀₁₂₃₄₅₆₇₈₉
  const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  const zeroCount = leadingZeros.toString().split('').map(d => subscripts[parseInt(d)]).join('');
  
  return `0.0${zeroCount}${significantDigits}`;
};

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [injectiveAddresses, setInjectiveAddresses] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  // Market selector state
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [marketsError, setMarketsError] = useState<string>("");

  // Trading interface state
  const [orderSide, setOrderSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  // Streaming orderbook state
  const [buyOrders, setBuyOrders] = useState<OrderBookEntry[]>([]);
  const [sellOrders, setSellOrders] = useState<OrderBookEntry[]>([]);
  const [orderbookLoading, setOrderbookLoading] = useState(true);
  const streamRef = useRef<any>(null);

  // User panel state - real data
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [userPanelError, setUserPanelError] = useState<string>("");

  // Order placement state
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string>("");
  const [orderSuccess, setOrderSuccess] = useState<string>("");

  // Initialize Injective API
  const endpoints = getNetworkEndpoints(Network.Testnet);
  const indexerGrpcSpotApi = new IndexerGrpcSpotApi(endpoints.indexer);
  const indexerGrpcSpotStream = new IndexerGrpcSpotStream(endpoints.indexer);
  const chainRestBankApi = new ChainRestBankApi(endpoints.rest);
  const chainGrpcExchangeApi = new ChainGrpcExchangeApi(endpoints.grpc);
  const restEndpoint = getNetworkEndpoints(Network.Testnet).rest;


  // Debug: Log when orderbook state changes
  useEffect(() => {
    console.log(
      "Orderbook state changed - Buy orders:",
      buyOrders.length,
      "Sell orders:",
      sellOrders.length
    );
  }, [buyOrders, sellOrders]);

  // Fetch user data when wallet is connected
  useEffect(() => {
    if (isConnected && injectiveAddresses.length > 0) {
      const primaryAddress = injectiveAddresses[0];
      console.log("Fetching user data for address:", primaryAddress);

      // Fetch balances and positions
      fetchUserBalances(primaryAddress);
      fetchUserPositions(primaryAddress);
    }
  }, [isConnected, injectiveAddresses, tradingPairs]); // Include tradingPairs for position ticker lookup

  // Clear order messages when form values change
  useEffect(() => {
    if (orderError || orderSuccess) {
      clearOrderMessages();
    }
  }, [price, quantity, orderSide, orderType, selectedPair]);

  // Fetch markets on component mount
  useEffect(() => {
    const fetchMarkets = async () => {
      try {
        setMarketsLoading(true);
        setMarketsError("");

        console.log("Fetching markets from Injective testnet...");
        const markets = await indexerGrpcSpotApi.fetchMarkets();
        console.log("Markets fetched:", markets);

        // Filter and format markets for display
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

        // Set default selected pair if none selected
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

  // Stream orderbook for selected market
  useEffect(() => {
    if (!selectedPair || tradingPairs.length === 0) return;

    const currentMarket = getCurrentPairData();
    if (!currentMarket) return;

    console.log(
      "Fetching initial orderbook and starting stream for market:",
      currentMarket.marketId
    );
    setOrderbookLoading(true);

    // Function to process orderbook data (shared between initial fetch and stream)
    const processOrderbookData = (orderbooks: any) => {
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
                .map((order: any) => {
                  return {
                    price: order.price,
                    quantity: order.quantity,
                    timestamp: order.timestamp || Date.now(),
                  };
                })
            : [];

          // Process sell orders (asks)
          const processedSellOrders: OrderBookEntry[] = orderbook.sells
            ? orderbook.sells
                .slice(0, 10) // Show top 10 levels
                .map((order: any) => {
                  return {
                    price: order.price,
                    quantity: order.quantity,
                    timestamp: order.timestamp || Date.now(),
                  };
                })
            : [];

          setBuyOrders(processedBuyOrders);
          setSellOrders(processedSellOrders);
          setOrderbookLoading(false);

          // Calculate current/mid price from orderbook
          // Use the midpoint between best bid and best ask
          if (processedBuyOrders.length > 0 && processedSellOrders.length > 0) {
            const bestBid = parseFloat(processedBuyOrders[0].price);
            const bestAsk = parseFloat(processedSellOrders[0].price);
            const midPrice = (bestBid + bestAsk) / 2;
            setCurrentPrice(midPrice);
            console.log(`Current price updated: ${midPrice} (Bid: ${bestBid}, Ask: ${bestAsk})`);
          } else if (processedBuyOrders.length > 0) {
            // Only buy orders available, use best bid
            const bestBid = parseFloat(processedBuyOrders[0].price);
            setCurrentPrice(bestBid);
            console.log(`Current price set to best bid: ${bestBid}`);
          } else if (processedSellOrders.length > 0) {
            // Only sell orders available, use best ask
            const bestAsk = parseFloat(processedSellOrders[0].price);
            setCurrentPrice(bestAsk);
            console.log(`Current price set to best ask: ${bestAsk}`);
          }

          console.log(
            `Processed ${processedBuyOrders.length} buy orders and ${processedSellOrders.length} sell orders`
          );
        } else {
          console.log(
            "No valid orderbook data found, but setting loading to false"
          );
          setOrderbookLoading(false);
        }
      } catch (err) {
        console.error("Error processing orderbook data:", err);
        console.error("Error stack:", err);
        setOrderbookLoading(false);
      }
    };

    // First, fetch the initial orderbook snapshot
    const fetchInitialOrderbook = async () => {
      try {
        console.log("Fetching initial orderbook snapshot...");
        const initialOrderbook = await indexerGrpcSpotApi.fetchOrderbookV2(
          currentMarket.marketId
        );
        console.log("Initial orderbook fetched:", initialOrderbook);
        processOrderbookData(initialOrderbook);
      } catch (err) {
        console.error("Error fetching initial orderbook:", err);
        setOrderbookLoading(false);
      }
    };

    // Fetch initial data
    fetchInitialOrderbook();

    // Then setup the stream for real-time updates
    const streamFn = indexerGrpcSpotStream.streamSpotOrderbookV2.bind(
      indexerGrpcSpotStream
    );

    const streamCallback = (orderbooks: any) => {
      console.log("Received orderbook stream update");
      processOrderbookData(orderbooks);
    };

    const streamFnArgs = {
      marketIds: [currentMarket.marketId],
      callback: streamCallback,
    };

    try {
      console.log("Starting orderbook stream...");
      streamRef.current = streamFn(streamFnArgs);
    } catch (err) {
      console.error("Error starting orderbook stream:", err);
    }

    // Cleanup function
    return () => {
      if (streamRef.current) {
        console.log("Cleaning up orderbook stream");
        streamRef.current = null;
      }
    };
  }, [selectedPair, tradingPairs]);

  const getCurrentPairData = () => {
    return (
      tradingPairs.find((pair) => pair.ticker === selectedPair) ||
      tradingPairs[0]
    );
  };

  const getQuoteSymbol = () => {
    const currentMarket = getCurrentPairData();
    return currentMarket?.quoteToken?.symbol || "$";
  };

  const fetchUserBalances = async (injectiveAddress: string) => {
    try {
      setBalancesLoading(true);
      setUserPanelError("");

      console.log("Fetching balances for address:", injectiveAddress);
      const balancesResponse = await chainRestBankApi.fetchBalances(
        injectiveAddress
      );
      console.log("Raw balances:", balancesResponse);

      // Process and format balances - access the balances array from the response
      const balancesArray = balancesResponse.balances || [];
      const formattedBalances: TokenBalance[] = balancesArray
        .map((balance: any) => {
          // Convert amount from base units (considering decimals)
          const amount = parseFloat(balance.amount) / Math.pow(10, 18); // Default 18 decimals, adjust as needed

          // Extract symbol from denom (better parsing and truncation)
          let symbol = balance.denom;

          if (balance.denom.startsWith("factory/")) {
            // Handle factory tokens - get the last part
            const parts = balance.denom.split("/");
            symbol = parts[parts.length - 1] || balance.denom;
          } else if (balance.denom.startsWith("ibc/")) {
            // Handle IBC tokens - show first 8 chars + ...
            symbol = "IBC/" + balance.denom.substring(4, 12) + "...";
          } else if (balance.denom.startsWith("peggy0x")) {
            // Handle Peggy (Ethereum bridge) tokens - show first part + ...
            symbol = "PEGGY/" + balance.denom.substring(7, 15) + "...";
          } else if (balance.denom === "inj") {
            symbol = "INJ";
          }

          // Final truncation - ensure no symbol is longer than 12 characters
          if (symbol.length > 12) {
            symbol = symbol.substring(0, 9) + "...";
          }

          return {
            symbol,
            amount,
            denom: balance.denom,
            usdValue: 0, // Would need additional price API call
          };
        })
        .filter((balance) => balance.amount > 0); // Only show non-zero balances

      setTokenBalances(formattedBalances);
      console.log("Formatted balances:", formattedBalances);
    } catch (err) {
      console.error("Error fetching balances:", err);
      setUserPanelError(
        `Failed to fetch balances: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setBalancesLoading(false);
    }
  };

  const fetchUserPositions = async (injectiveAddress: string) => {
    try {
      setPositionsLoading(true);
      setUserPanelError("");

      console.log("Fetching positions for address:", injectiveAddress);
      const subaccountId = getDefaultSubaccountId(injectiveAddress);

      const orders = await indexerGrpcSpotApi.fetchSubaccountOrdersList({
        subaccountId,
      });
      console.log(orders);
      // Try to fetch positions - the API might require subaccount filtering
      try {
        const positionsResponse = await chainGrpcExchangeApi.fetchPositions();
        console.log("Raw positions:", positionsResponse);

        // Handle different response formats and filter by address if needed
        const positionsArray = Array.isArray(positionsResponse)
          ? positionsResponse
          : [];

        // Filter positions for this specific address if they contain address info
        const userPositions = positionsArray.filter((position: any) => {
          // If positions have subaccount info, filter by it
          if (
            position.subaccountId &&
            position.subaccountId.includes(injectiveAddress.replace("inj", ""))
          ) {
            return true;
          }
          return true; // For now, show all positions until we understand the data structure
        });

        // Process and format positions
        const formattedPositions: Position[] = userPositions
          .filter((position: any) => position && position.marketId) // Filter out invalid positions
          .map((position: any) => {
            // Find matching market ticker
            const market = tradingPairs.find(
              (pair) => pair.marketId === position.marketId
            );

            return {
              subaccountId: position.subaccountId || "",
              marketId: position.marketId,
              direction: position.direction || "unknown",
              quantity: position.quantity || "0",
              entryPrice: position.entryPrice || "0",
              margin: position.margin || "0",
              liquidationPrice: position.liquidationPrice || "0",
              markPrice: position.markPrice || "0",
              ticker:
                market?.ticker ||
                (position.marketId
                  ? position.marketId.substring(0, 8) + "..."
                  : "Unknown"),
            };
          })
          .filter((position: Position) => position.quantity !== "0"); // Only show positions with quantity

        setPositions(formattedPositions);
        console.log("Formatted positions:", formattedPositions);
      } catch (positionError) {
        console.log(
          "Position fetching failed, this might be normal if no positions exist:",
          positionError
        );
        setPositions([]); // Set empty array instead of erroring
      }
    } catch (err) {
      console.error("Error in fetchUserPositions:", err);
      setUserPanelError(
        `Failed to fetch positions: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  };

  const calculateTotal = () => {
    // Use current price for market orders, user input for limit orders
    const priceNum = orderType === "market" ? currentPrice : parseFloat(price || "0");
    const quantityNum = parseFloat(quantity || "0");
    return priceNum * quantityNum;
  };

  const handlePriceClick = (clickedPrice: string) => {
    // Only allow clicking orderbook prices for limit orders
    if (orderType === "limit") {
      setPrice(clickedPrice);
    }
  };

  const handlePlaceOrder = async () => {
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

    // Validate price based on order type
    if (orderType === "limit") {
      if (!price || parseFloat(price) <= 0) {
        setOrderError("Please enter a valid price for limit order");
        return;
      }
    } else {
      // Market order - check if current price is available
      if (currentPrice <= 0) {
        setOrderError("Market price not available yet. Please wait for orderbook to load.");
        return;
      }
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

      // Get market multipliers
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

      console.log("Market conversion details:", {
        marketId: market.marketId,
        baseDecimals: market.baseDecimals,
        quoteDecimals: market.quoteDecimals,
        priceTensMultiplier: tensMultipliers.priceTensMultiplier,
        quantityTensMultiplier: tensMultipliers.quantityTensMultiplier,
        decimalsDifference: market.quoteDecimals - market.baseDecimals,
      });

      // Create subaccount ID
      const ethereumAddress = getEthereumAddress(injectiveAddress);
      const subaccountIndex = 0;
      const suffix = "0".repeat(23) + subaccountIndex;
      const subaccountId = ethereumAddress + suffix;

      // Determine order type (1 = Buy, 2 = Sell)
      const orderTypeValue = orderSide === "buy" ? 1 : 2;

      // Fee recipient (can be the same as injective address or empty)
      const feeRecipient = injectiveAddress;

      let msg;

      if (orderType === "limit") {
        const limitPrice = parseFloat(price);
        console.log("Limit order - Using price from input:", limitPrice);

        // Convert price to chain format
        const chainPrice = spotPriceToChainPriceToFixed({
          value: limitPrice,
          tensMultiplier: marketWithMultipliers.priceTensMultiplier,
          baseDecimals: marketWithMultipliers.baseDecimals,
          quoteDecimals: marketWithMultipliers.quoteDecimals,
        });

        // Convert quantity to chain format
        const chainQuantity = spotQuantityToChainQuantityToFixed({
          value: parseFloat(quantity),
          tensMultiplier: marketWithMultipliers.quantityTensMultiplier,
          baseDecimals: marketWithMultipliers.baseDecimals,
        });

        console.log("Price conversion:", {
          originalPrice: limitPrice,
          chainPrice: chainPrice,
          formula: `${limitPrice} × 10^(${
            marketWithMultipliers.quoteDecimals
          } - ${marketWithMultipliers.baseDecimals}) = ${limitPrice} × 10^${
            marketWithMultipliers.quoteDecimals -
            marketWithMultipliers.baseDecimals
          }`,
        });

        console.log("Quantity conversion:", {
          originalQuantity: parseFloat(quantity),
          chainQuantity: chainQuantity,
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
        // Market order - use current mid-market price
        const marketPrice = currentPrice;
        
        console.log(`Market ${orderSide.toUpperCase()} order - Current price check:`, {
          currentPrice,
          marketPrice,
          buyOrdersLength: buyOrders.length,
          sellOrdersLength: sellOrders.length,
          bestBid: buyOrders[0]?.price,
          bestAsk: sellOrders[0]?.price,
        });

        if (marketPrice <= 0 || isNaN(marketPrice)) {
          throw new Error(`Invalid market price: ${marketPrice}. Orderbook may not be loaded.`);
        }

        console.log(`Using market price: ${marketPrice}`);

        // Convert price to chain format
        const chainPrice = spotPriceToChainPriceToFixed({
          value: marketPrice,
          tensMultiplier: marketWithMultipliers.priceTensMultiplier,
          baseDecimals: marketWithMultipliers.baseDecimals,
          quoteDecimals: marketWithMultipliers.quoteDecimals,
        });

        // Convert quantity to chain format
        const chainQuantity = spotQuantityToChainQuantityToFixed({
          value: parseFloat(quantity),
          tensMultiplier: marketWithMultipliers.quantityTensMultiplier,
          baseDecimals: marketWithMultipliers.baseDecimals,
        });

        console.log("Market order price conversion:", {
          originalPrice: marketPrice,
          chainPrice: chainPrice,
          chainPriceType: typeof chainPrice,
          formula: `${marketPrice} × 10^(${
            marketWithMultipliers.quoteDecimals
          } - ${marketWithMultipliers.baseDecimals}) = ${marketPrice} × 10^${
            marketWithMultipliers.quoteDecimals -
            marketWithMultipliers.baseDecimals
          }`,
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

      // Broadcast the transaction using MetaMask
      console.log("Order message created:", msg);
      console.log("Market details:", marketWithMultipliers);

      try {
        // Get account details for transaction creation
        const accountDetailsApi = new ChainRestAuthApi(endpoints.rest);
        const accountDetails = await accountDetailsApi.fetchAccount(
          injectiveAddress
        );

        console.log("Account details:", accountDetails);

        // Access the account properties correctly based on the API response structure
        const baseAccount =
          accountDetails.account.base_account || accountDetails.account;
        const pubKey = baseAccount.pub_key?.key || "";
        const sequence = parseInt(baseAccount.sequence, 10);
        const accountNumber = parseInt(baseAccount.account_number, 10);

        // Create transaction with the order message
        const { signBytes, txRaw } = createTransaction({
          message: msg,
          memo: `${orderType.toUpperCase()} ${orderSide.toUpperCase()} order via Injective Trading App`,
          fee: {
            amount: [
              {
                amount: "400000000000000000", // 0.4 INJ
                denom: "inj",
              },
            ],
            gas: "400000",
          },
          pubKey: pubKey,
          sequence: sequence,
          accountNumber: accountNumber,
          chainId: "injective-888", // Testnet chain ID
        });

        // Sign the transaction using MetaMask
        console.log("Requesting signature from MetaMask...");
        console.log("Sign bytes:", signBytes);

        const ethereum = getEthereum();

        // Convert signBytes to hex format for MetaMask signing
        const signBytesHex = "0x" + Buffer.from(signBytes).toString("hex");

        const signature = await ethereum.request({
          method: "personal_sign",
          params: [signBytesHex, addresses[0]], // Use the EVM address for signing
        });

        console.log("Signature received:", signature);

        // Create the properly formatted transaction with signature
        const signedTxRaw = {
          ...txRaw,
          signatures: [Buffer.from(signature.slice(2), "hex")], // Remove '0x' prefix and convert to Buffer
        };

        console.log("Signed transaction prepared:", signedTxRaw);

        /** Broadcast the Transaction */
        const txRestApi = new TxRestApi(restEndpoint);

        const txResponse = await txRestApi.broadcast(signedTxRaw);
        const response = await txRestApi.fetchTxPoll(txResponse.txHash);
        console.log(response)
        // For now, we'll show success since the transaction is properly signed
        // The actual broadcasting would need proper transaction encoding
        setOrderSuccess(`✅ Order signed successfully!
                        Market: ${currentMarket.ticker}
                        Type: ${orderType.toUpperCase()} ${orderSide.toUpperCase()}
                        Quantity: ${quantity}
                        ${
                          orderType === "limit"
                            ? `Price: ${price}`
                            : "Market Order"
                        }
                        
                        Transaction has been signed with MetaMask.
                        Broadcasting functionality can be enhanced with proper SDK integration.
                        Check console for transaction details.`);

        // Clear form
        setPrice("");
        setQuantity("");

        // Refresh user data
        setTimeout(() => {
          refreshUserData();
        }, 2000);
      } catch (broadcastError) {
        console.error("Error broadcasting transaction:", broadcastError);
        setOrderError(
          `Failed to broadcast transaction: ${
            broadcastError instanceof Error
              ? broadcastError.message
              : "Unknown error"
          }`
        );
      }
    } catch (err) {
      console.error("Error creating order:", err);
      setOrderError(
        err instanceof Error ? err.message : "Failed to create order"
      );
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const clearOrderMessages = () => {
    setOrderError("");
    setOrderSuccess("");
  };

  const refreshUserData = () => {
    if (isConnected && injectiveAddresses.length > 0) {
      const primaryAddress = injectiveAddresses[0];
      fetchUserBalances(primaryAddress);
      fetchUserPositions(primaryAddress);
    }
  };

  const connectWallet = async () => {
    try {
      setError("");
      const ethereum = getEthereum();
      const evmAddresses = await ethereum.request({
        method: "eth_requestAccounts",
      }); /** these are evm addresses */

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
    console.log("Disconnecting wallet. Previous addresses:", addresses); // Use addresses variable
    setIsConnected(false);
    setAddresses([]);
    setInjectiveAddresses([]);
    setTokenBalances([]);
    setPositions([]);
    setError("");
  };

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  return (
    <>
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
                <span
                  className="address-text"
                  title={injectiveAddresses[0] || ""}
                >
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

      <main className="main-content">
        <div className="market-selector">
          <div className="market-selector-container">
            <h3>MARKET SELECTOR</h3>
            {marketsLoading ? (
              <div className="loading-message">Loading markets...</div>
            ) : marketsError ? (
              <div
                className="error-message"
                style={{ color: "red", margin: "10px 0" }}
              >
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
                <div className="market-info-display">
                  <div className="token-info">
                    {getCurrentPairData()?.baseToken?.logo && (
                      <img
                        src={getCurrentPairData()?.baseToken?.logo}
                        alt={getCurrentPairData()?.baseToken?.symbol}
                        className="token-logo"
                      />
                    )}
                    <span className="token-symbol">
                      {getCurrentPairData()?.baseToken?.symbol ||
                        getCurrentPairData()?.baseDenom ||
                        "N/A"}
                    </span>
                    <span className="separator">/</span>
                    {getCurrentPairData()?.quoteToken?.logo && (
                      <img
                        src={getCurrentPairData()?.quoteToken?.logo}
                        alt={getCurrentPairData()?.quoteToken?.symbol}
                        className="token-logo"
                      />
                    )}
                    <span className="token-symbol">
                      {getCurrentPairData()?.quoteToken?.symbol ||
                        getCurrentPairData()?.quoteDenom ||
                        "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Three-Column Trading Interface */}
        <div className="trading-interface">
          {/* Left Column - Order Book */}
          <div className="order-book-column">
            <div className="order-book">
              <h3>ORDER BOOK</h3>

              {orderbookLoading ? (
                <div className="loading-message">Loading orderbook...</div>
              ) : (
                <>
                  <div
                    className="debug-info"
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginBottom: "10px",
                    }}
                  >
                    Buy Orders: {buyOrders.length} | Sell Orders:{" "}
                    {sellOrders.length} | Last Update:{" "}
                    {new Date().toLocaleTimeString()}
                  </div>

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
                            {formatSmallPrice(parseFloat(order.price), getQuoteSymbol())}
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
                    <span>
                      {currentPrice > 0 
                        ? `${formatSmallPrice(currentPrice, getQuoteSymbol())} ${getQuoteSymbol()}` 
                        : 'CURRENT: --'}
                    </span>
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
                          {formatSmallPrice(parseFloat(order.price), getQuoteSymbol())}
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
          </div>

          {/* Center Column - Trading Form */}
          <div className="trading-form-column">
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
                <label>Price ({getQuoteSymbol()})</label>
                <input
                  type="number"
                  value={orderType === "market" ? currentPrice.toFixed(6) : price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={orderType === "market"}
                  placeholder="0.000"
                  step="0.001"
                />
                {orderType === "limit" && price && parseFloat(price) > 0 && (
                  <div style={{ 
                    fontSize: "0.85rem", 
                    color: "#666", 
                    marginTop: "4px",
                    fontFamily: "monospace"
                  }}>
                    ≈ {formatSmallPrice(parseFloat(price), getQuoteSymbol())} {getQuoteSymbol()}
                  </div>
                )}
                {orderType === "market" && currentPrice > 0 && (
                  <div style={{ 
                    fontSize: "0.85rem", 
                    color: "#666", 
                    marginTop: "4px",
                    fontFamily: "monospace"
                  }}>
                    Using current market price: {formatSmallPrice(currentPrice, getQuoteSymbol())} {getQuoteSymbol()}
                  </div>
                )}
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
                <span>
                  Total: {formatSmallPrice(calculateTotal(), getQuoteSymbol())} {getQuoteSymbol()}
                </span>
              </div>

              {/* Order Status Messages */}
              {orderError && (
                <div
                  className="order-error"
                  style={{
                    padding: "0.5rem 1rem",
                    background: "#fee",
                    color: "#c53030",
                    fontSize: "0.75rem",
                    borderRadius: "4px",
                    margin: "0.5rem 1rem",
                    border: "1px solid #fed7d7",
                    maxHeight: "80px",
                    overflowY: "auto",
                  }}
                >
                  <strong>Error:</strong> {orderError}
                  <button
                    onClick={clearOrderMessages}
                    style={{
                      float: "right",
                      background: "none",
                      border: "none",
                      color: "#c53030",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      marginLeft: "8px",
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {orderSuccess && (
                <div
                  className="order-success"
                  style={{
                    padding: "0.5rem 1rem",
                    background: "#f0fff4",
                    color: "#22543d",
                    fontSize: "0.75rem",
                    borderRadius: "4px",
                    margin: "0.5rem 1rem",
                    border: "1px solid #9ae6b4",
                    whiteSpace: "pre-line",
                    maxHeight: "80px",
                    overflowY: "auto",
                  }}
                >
                  <strong>Success:</strong> {orderSuccess}
                  <button
                    onClick={clearOrderMessages}
                    style={{
                      float: "right",
                      background: "none",
                      border: "none",
                      color: "#22543d",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      marginLeft: "8px",
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

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
                  <>
                    <span>Placing Order...</span>
                  </>
                ) : (
                  `Place ${orderSide.toUpperCase()} Order`
                )}
              </button>

              {/* Connection Warning */}
              {!isConnected && (
                <div
                  style={{
                    padding: "0.5rem 1rem",
                    textAlign: "center",
                    fontSize: "0.8rem",
                    color: "#666",
                    fontStyle: "italic",
                  }}
                >
                  Connect wallet to place orders
                </div>
              )}
            </div>
          </div>

          {/* Right Column - User Panel */}
          <div className="user-panel-column">
            <div className="user-panel">
              <div
                className="user-panel-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
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
                <div
                  className="error-message"
                  style={{ color: "red", fontSize: "12px", margin: "5px 0" }}
                >
                  {userPanelError}
                </div>
              )}

              {!isConnected && (
                <div
                  className="connect-prompt"
                  style={{
                    textAlign: "center",
                    padding: "20px",
                    color: "#666",
                  }}
                >
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
                              borderBottom: balance.symbol.includes("...")
                                ? "1px dotted #666"
                                : "none",
                            }}
                          >
                            {balance.symbol}
                          </span>
                          <span className="amount">
                            {balance.amount.toFixed(6)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div
                        className="no-balances"
                        style={{ color: "#666", fontSize: "12px" }}
                      >
                        {balancesLoading
                          ? "Loading balances..."
                          : "No balances found"}
                      </div>
                    )}
                  </div>

                  {/* Active Orders - Now showing Positions */}
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
                          <span
                            className="market"
                            title={position.marketId}
                            style={{ fontSize: "11px" }}
                          >
                            {position.ticker}
                          </span>
                          <span
                            className={`side ${
                              position.direction?.toLowerCase() || "unknown"
                            }`}
                          >
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
                      <div
                        className="no-orders"
                        style={{ color: "#666", fontSize: "12px" }}
                      >
                        {positionsLoading
                          ? "Loading positions..."
                          : "No active positions"}
                      </div>
                    )}

                    {/* Show additional position details if any positions exist */}
                    {positions.length > 0 && (
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#666",
                          marginTop: "10px",
                          textAlign: "center",
                        }}
                      >
                        Hover over market names for full IDs
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div
            className="error-message"
            style={{ color: "red", margin: "10px 0" }}
          >
            Error: {error}
          </div>
        )}
      </main>
    </>
  );
}

export default App;
