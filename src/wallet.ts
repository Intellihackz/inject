// filename: Wallet.ts
import { Wallet } from '@injectivelabs/wallet-base'
import { WalletStrategy } from '@injectivelabs/wallet-strategy'
import { ChainId, EthereumChainId } from '@injectivelabs/ts-types'

const chainId = ChainId.Testnet // The Injective Chain chainId
const ethereumChainId = EthereumChainId.Goerli // The Ethereum Chain ID

export const alchemyRpcEndpoint = `https://eth-goerli.alchemyapi.io/v2/${process.env.APP_ALCHEMY_GOERLI_KEY}`

export const walletStrategy = new WalletStrategy({
  chainId: ChainId,
  ethereumOptions: {
    rpcUrl: alchemyRpcEndpoint,
    ethereumChainId: ETHEREUM_CHAIN_ID,
  },
})