import {
  createStateQueryClient,
  currentEpoch,
  currentProtocolParameters,
  delegationsAndRewards,
  eraStart,
  genesisConfig,
  ledgerTip,
  nonMyopicMemberRewards,
  proposedProtocolParameters,
  stakeDistribution,
  utxo
} from '@src/StateQuery'
import {
  DelegationsAndRewards,
  Hash16,
  Slot
} from '@cardano-ogmios/schema'
import { dummyInteractionContext } from './util'
import { InteractionContext } from '@src/Connection'

describe('Local state queries', () => {
  describe('StateQueryClient', () => {
    it('opens a connection on construction, and closes it after shutdown', async () => {
      const context = await dummyInteractionContext()
      const client = await createStateQueryClient(context)
      await client.shutdown()
      expect(client.context.socket.readyState).not.toBe(client.context.socket.OPEN)
    })

    it('gets the point from the tip if none provided', async () => {
      const context = await dummyInteractionContext()
      const client = await createStateQueryClient(context)
      const { point } = client
      expect(point).toBeDefined()
      await client.shutdown()
    })

    it('uses the provided point for reproducible queries across clients', async () => {
      const context = await dummyInteractionContext()
      const client = await createStateQueryClient(context)
      const anotherContext = await dummyInteractionContext()
      const anotherClient = await createStateQueryClient(anotherContext)
      expect(anotherClient.point).toEqual(client.point)
      await client.shutdown()
      await anotherClient.shutdown()
    })

    it('rejects if the provided point is too old', async () => {
      const context = await dummyInteractionContext()
      const createWithOldPoint = async () => {
        await createStateQueryClient(context, { point: 'origin' })
      }
      await expect(createWithOldPoint).rejects
      expect(context.socket.readyState).toBe(context.socket.OPEN)
      context.socket.close()
    })

    it('rejects method calls after shutdown', async () => {
      const context = await dummyInteractionContext()
      const client = await createStateQueryClient(context)
      await client.shutdown()
      const run = () => client.currentEpoch()
      await expect(run).rejects
    })

    describe('calling queries from the client', () => {
      it('exposes the queries, uses a single context, and should be shutdownd when done', async () => {
        const context = await dummyInteractionContext()
        const client = await createStateQueryClient(context)

        const epoch = await client.currentEpoch()
        expect(epoch).toBeDefined()

        const protocolParameters = await client.currentProtocolParameters()
        expect(protocolParameters.protocolVersion.major).toBeDefined()

        const delegationsAndRewardsResult = await client.delegationsAndRewards(
          ['7c16240714ea0e12b41a914f2945784ac494bb19573f0ca61a08afa8']
        )
        expect(Object.keys(delegationsAndRewardsResult).length).toBe(1)

        const bound = await client.eraStart()
        expect(bound.slot).toBeDefined()

        const compactGenesis = await client.genesisConfig()
        expect(compactGenesis.systemStart).toBeDefined()

        const point = await client.ledgerTip() as { slot: Slot, hash: Hash16 }
        expect(point.slot).toBeDefined()

        const nonMyopicMemberRewards = await client.nonMyopicMemberRewards(
          ['7c16240714ea0e12b41a914f2945784ac494bb19573f0ca61a08afa8']
        )
        expect(
          Object.values(Object.values(nonMyopicMemberRewards)[0])[0]
        ).toBeDefined()

        const proposedProtocolParameters = await client.proposedProtocolParameters()
        expect(proposedProtocolParameters).toBeDefined()

        const stakeDistribution = await client.stakeDistribution()
        expect(Object.values(stakeDistribution)[0].stake).toBeDefined()

        const utxoSet = await client.utxo([
          'addr_test1qqymtheun4y437fa6cms4jmtfex39wzz7jfwggudwnqkdnr8udjk6d89dcjadt7tw6hmz0aeue2jzdpl2vnkz8wdk4fqz3y5m9'
        ])
        expect(utxoSet[0]).toBeDefined()

        await client.shutdown()
      })

      it('can handle concurrent requests ', async () => {
        const context = await dummyInteractionContext()
        const client = await createStateQueryClient(context)
        const [currentEpoch, eraStart, ledgerTip] = await Promise.all([
          client.currentEpoch(),
          client.eraStart(),
          client.ledgerTip()
        ])
        expect(currentEpoch).toBeDefined()
        expect(eraStart).toBeDefined()
        expect(ledgerTip).toBeDefined()
        await client.shutdown()
      })
    })
  })

  describe('Queries', () => {
    let context: InteractionContext

    beforeAll(async () => {
      context = await dummyInteractionContext()
    })

    afterAll(async () => {
      context.socket.close()
    })

    describe('currentEpoch', () => {
      it('fetches the current epoch number', async () => {
        const epoch = await currentEpoch(context)
        expect(epoch).toBeDefined()
      })
    })
    describe('currentProtocolParameters', () => {
      it('fetches the current protocol parameters', async () => {
        const protocolParameters = await currentProtocolParameters(context)
        expect(protocolParameters.minFeeCoefficient).toBeDefined()
        expect(protocolParameters.protocolVersion.major).toBeDefined()
      })
    })
    describe('delegationsAndRewards', () => {
      it('fetches the current delegate and rewards for given stake key hashes', async () => {
        const stakeKeyHashes = ['7c16240714ea0e12b41a914f2945784ac494bb19573f0ca61a08afa8'] as Hash16[]
        const result = await delegationsAndRewards(context, stakeKeyHashes)
        const item = result[stakeKeyHashes[0]] as DelegationsAndRewards
        expect(item).toHaveProperty('delegate')
        expect(item).toHaveProperty('rewards')
      })
    })
    describe('eraStart', () => {
      it('fetches the bound of the current era', async () => {
        const bound = await eraStart(context)
        expect(bound.time).toBeDefined()
        expect(bound.slot).toBeDefined()
        expect(bound.epoch).toBeDefined()
      })
    })
    describe('genesisConfig', () => {
      it('fetches the config used to bootstrap the blockchain, excluding the genesis UTXO', async () => {
        const config = await genesisConfig(context)
        expect(config.systemStart).toBeDefined()
        expect(config.networkMagic).toBeDefined()
      })
    })
    describe('ledgerTip', () => {
      it('fetches the tip of the ledger', async () => {
        const point = await ledgerTip(context) as { slot: Slot, hash: Hash16 }
        expect(point.hash).toBeDefined()
        expect(point.slot).toBeDefined()
      })
    })
    describe('nonMyopicMemberRewards', () => {
      describe('fetches the Non-myopic member rewards for each pool. Used in ranking.', () => {
        it('accepts array of values, either stake key hash or lovelace', async () => {
          const stakeKeyHash = '7c16240714ea0e12b41a914f2945784ac494bb19573f0ca61a08afa8'
          const rewards = await nonMyopicMemberRewards(context, [stakeKeyHash])
          expect(Object.values(rewards[stakeKeyHash])[0]).toBeDefined()
        })
      })
    })
    describe('proposedProtocolParameters', () => {
      it('fetches the proposed protocol parameters', async () => {
        const protocolParameters = await proposedProtocolParameters(context)
        expect(protocolParameters).toBeDefined()
      })
    })
    describe('stakeDistribution', () => {
      it('fetches the distribution of the stake across all known stake pools', async () => {
        const poolDistribution = await stakeDistribution(context)
        const pool = Object.values(poolDistribution)[0]
        expect(pool.stake).toBeDefined()
        expect(pool.vrf).toBeDefined()
      })
    })
    describe('utxo', () => {
      it('fetches the complete UTxO set when an empty array is provided', async () => {
        const utxoSet = await utxo(context, [])
        expect(utxoSet[0]).toBeDefined()
      })
      it('fetches the UTxO for the given addresses', async () => {
        const utxoSet = await utxo(context, ['addr_test1qqymtheun4y437fa6cms4jmtfex39wzz7jfwggudwnqkdnr8udjk6d89dcjadt7tw6hmz0aeue2jzdpl2vnkz8wdk4fqz3y5m9'])
        expect(utxoSet[0]).toBeDefined()
      })
    })
  })
})
