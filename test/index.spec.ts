import { Alice, AliceBob, Bob } from '../src'

describe('suite', () => {
  describe('AliceBob', () => {
    it('create an AliceBob instance', () => {
      const alicebob = new AliceBob()
      expect(alicebob).toBeInstanceOf(AliceBob)
    })

    it('accept a send method', () => {
      const alicebob = new AliceBob(_ => void 0)
      expect(alicebob).toBeInstanceOf(AliceBob)
    })
  })

  describe('Alice', () => {
    it('create an Alice instance', () => {
      const alice = new Alice()
      expect(alice).toBeInstanceOf(Alice)
      expect(alice.local.name).toEqual('alice')
      expect(alice.remote.name).toEqual('bob')
    })

    it('accept a send method', () => {
      const alice = new Alice(_ => void 0)
      expect(alice).toBeInstanceOf(Alice)
    })
  })

  describe('Bob', () => {
    it('create an Alice instance', () => {
      const bob = new Bob()
      expect(bob).toBeInstanceOf(Bob)
      expect(bob.local.name).toEqual('bob')
      expect(bob.remote.name).toEqual('alice')
    })

    it('accept a send method', () => {
      const bob = new Bob(_ => void 0)
      expect(bob).toBeInstanceOf(Bob)
    })
  })

  describe('.agents', () => {
    it('return [local, remote] tuple', () => {
      const rpc = new AliceBob()
      const [alice, bob] = rpc.agents()
      expect(alice).toBe(rpc.local)
      expect(bob).toBe(rpc.remote)
      expect(alice.name).toEqual('local')
      expect(bob.name).toEqual('remote')
    })

    it('accepts options objects', () => {
      const rpc = new AliceBob()
      const [alice, bob] = rpc.agents({})
      expect(alice).toBe(rpc.local)
      expect(bob).toBe(rpc.remote)
      expect(alice.name).toEqual('local')
      expect(bob.name).toEqual('remote')
    })
  })

  describe('send', () => {
    xit('passes payload', () => {
      interface Remote {
        hello: (arg: string) => void
      }
      const [alice, bob] = new AliceBob<void, Remote>().agents()
      const fn = jest.fn()
      alice.send = fn
      bob.hello('there')
      expect(fn).toBeCalledTimes(1)
      expect(fn).toBeCalledWith({ id: 0, method: 'hello', args: ['there'] })
    })

    it('throws when missing', () => {
      interface Remote {
        hello: (arg: string) => void
      }
      const [, bob] = new AliceBob<void, Remote>().agents()
      expect(bob.hello('there')).rejects.toEqual(
        // TODO: test just contains "must be provided"
        new TypeError('local.send(payload) method must be provided.')
      )
    })

    xit('deferred send work', () => {
      interface Remote {
        hello: (arg: string) => void
      }
      const [alice, bob] = new AliceBob<void, Remote>().agents()
      const fn = jest.fn()
      alice.deferredSend = () => fn
      bob.hello('there')
      expect(fn).toBeCalledTimes(1)
      expect(fn).toBeCalledWith({ id: 0, method: 'hello', args: ['there'] })
    })
  })

  describe('receive', () => {
    xit('passes payload', async () => {
      interface Remote {
        hello: (arg: string) => void
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents()
      const [bob] = new AliceBob<Remote, void>().agents()
      const receive = jest.spyOn(bob, 'receive')
      alice.send = bob.receive // payload => setTimeout(() => bob.receive(payload))
      bob.send = alice.receive
      bob.hello = jest.fn()
      _bob.hello('there')
      expect(bob.hello).toBeCalledTimes(1)
      expect(bob.hello).toBeCalledWith('there')
      expect(receive).toBeCalledTimes(1)
      expect(receive).toBeCalledWith({ id: 0, method: 'hello', args: ['there'] })
    })
  })

  describe('callbacks', () => {
    it('are async', async () => {
      interface Remote {
        hello: (a: number, b: number) => Promise<number>
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents()
      const [bob] = new AliceBob<Remote, void>().agents()
      alice.send = bob.receive
      bob.send = alice.receive
      bob.hello = async (a: number, b: number) => new Promise<number>(r => setTimeout(r, 5, a + b))
      const result = await _bob.hello(2, 3)
      expect(result).toEqual(5)
    })

    it('wait for async return (ack)', async () => {
      interface Remote {
        hello: (a: number, b: number) => Promise<number>
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents()
      const [bob] = new AliceBob<Remote, void>().agents()
      alice.send = bob.receive
      bob.send = alice.receive
      let asyncValue = 'fail'
      bob.hello = async (a: number, b: number) =>
        new Promise<number>(resolve =>
          setTimeout(
            (value: number) => {
              asyncValue = 'pass'
              resolve(value)
            },
            150,
            a + b
          )
        )
      const result = await _bob.hello(2, 3)
      expect(asyncValue).toEqual('pass')
      expect(result).toEqual(5)
    })

    it('wait for async return (ack) for deferredSend', async () => {
      interface Remote {
        hello: (a: number, b: number) => Promise<number>
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents()
      const [bob] = new AliceBob<Remote, void>().agents()
      alice.deferredSend = () => bob.receive
      bob.deferredSend = () => alice.receive
      let asyncValue = 'fail'
      bob.hello = (a: number, b: number) =>
        new Promise<number>(resolve =>
          setTimeout(
            (value: number) => {
              asyncValue = 'pass'
              resolve(value)
            },
            150,
            a + b
          )
        )
      const result = await _bob.hello(2, 3)
      expect(asyncValue).toEqual('pass')
      expect(result).toEqual(5)
    })

    it('pass exceptions back to the caller', async () => {
      interface Remote {
        hello: (a: number, b: number) => Promise<number>
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents()
      const [bob] = new AliceBob<Remote, void>().agents()
      alice.send = bob.receive
      bob.send = alice.receive
      bob.hello = async (_a: number, _b: number) =>
        new Promise<number>((_, r) => setTimeout(r, 5, new Error('it failed')))
      await expect(_bob.hello(2, 3)).rejects.toEqual(new Error('it failed'))
    })

    xit('pass exceptions back to the caller and log with debug=true', async () => {
      interface Remote {
        hello: (a: number, b: number) => Promise<number>
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents()
      const [bob] = new AliceBob<Remote, void>().agents({ debug: true })
      const fn = jest.fn()
      bob.log = fn
      alice.send = bob.receive
      bob.send = alice.receive
      bob.hello = async (_a: number, _b: number) =>
        new Promise<number>((_, r) => setTimeout(r, 5, new Error('it failed')))
      await expect(_bob.hello(2, 3)).rejects.toEqual(new Error('it failed'))
      expect(fn.mock.calls[2][0].message).toContain('it failed')
    })

    it('throw when missing', async () => {
      interface Remote {
        hello: (a: number, b: number) => Promise<number>
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents()
      const [bob] = new AliceBob<Remote, void>().agents()
      alice.send = bob.receive
      bob.send = alice.receive
      await expect(_bob.hello(2, 3)).rejects.toEqual(
        new TypeError(
          // TODO: not such strict error message matching
          'Agent method "hello" is not a function. Instead found: undefined'
        )
      )
    })
  })

  describe('debug=true', () => {
    xit('call the log function with debug info', () => {
      interface Remote {
        hello: (arg: string) => void
      }
      const [alice, _bob] = new AliceBob<void, Remote>().agents({ debug: true })
      const [bob] = new AliceBob<Remote, void>().agents({ debug: true })
      const receive = jest.spyOn(bob, 'receive')
      const fn = jest.fn()
      const logA = jest.spyOn(alice, 'log')
      const logB = jest.spyOn(bob, 'log')
      alice.send = bob.receive
      bob.send = alice.receive
      bob.hello = fn
      _bob.hello('there')
      expect(receive).toBeCalledTimes(1)
      expect(fn).toBeCalledTimes(1)
      expect(fn).toBeCalledWith('there')
      expect(logA).toBeCalledTimes(1)
      expect(logA.mock.calls[0][0]).toContain('SEND')
      expect(logA.mock.calls[0][1]).toContain('0 local')
      expect(logA.mock.calls[0][3]).toEqual('hello')
      expect(logA.mock.calls[0][4]).toEqual(['there'])
      expect(logB).toBeCalledTimes(1)
      expect(logB.mock.calls[0][0]).toContain('RECV')
      expect(logB.mock.calls[0][1]).toContain('remote 0')
      expect(logB.mock.calls[0][3]).toEqual('hello')
      expect(logB.mock.calls[0][4]).toEqual(['there'])
    })

    xit('can be added lazily to agent', () => {
      interface Remote {
        hello: (arg: string) => void
      }
      const [alice, bob] = new AliceBob<void, Remote>().agents()
      const fn = jest.fn()
      const log = jest.fn()
      alice.send = fn
      alice.log = log
      alice.debug = true
      bob.hello('there')
      expect(fn).toBeCalledTimes(1)
      expect(fn).toBeCalledWith({ id: 0, method: 'hello', args: ['there'] })
      expect(log).toBeCalledTimes(1)
      expect(log.mock.calls[0][0]).toContain('SEND')
      expect(log.mock.calls[0][1]).toContain('0 local')
      expect(log.mock.calls[0][3]).toEqual('hello')
      expect(log.mock.calls[0][4]).toEqual(['there'])
    })
  })

  describe('agentOptions', () => {
    it('local overrides', () => {
      const [alice] = new AliceBob().agents({ debug: true, name: 'server' })
      expect(alice.debug).toEqual(true)
      expect(alice.name).toEqual('server')
    })

    it('remote overrides', () => {
      const [, bob] = new AliceBob().agents(null, { debug: true, name: 'client' })
      expect(bob.debug).toEqual(true)
      expect(bob.name).toEqual('client')
    })
  })

  describe('serializer/deserializer', () => {
    it('works', async () => {
      interface Remote {
        hello: (a: number, b: number) => Promise<number>
      }
      const options = {
        serializer: (data: any) => JSON.stringify(data),
        deserializer: (data: any) => JSON.parse(data),
      }

      const [alice, _bob] = new AliceBob<void, Remote>().agents(options)
      const [bob] = new AliceBob<Remote, void>().agents(options)
      alice.send = bob.receive
      bob.send = alice.receive
      bob.hello = async (a: number, b: number) => new Promise<number>(r => setTimeout(r, 5, a + b))
      const result = await _bob.hello(2, 3)
      expect(result).toEqual(5)
    })
  })
})
