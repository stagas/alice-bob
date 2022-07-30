import { pop } from './util'

/**
 * Payload.
 */
export interface Payload<T> {
  /**
   * Payload id.
   */
  id: number
  /**
   * Method to call.
   */
  method: keyof T
  /**
   * The arguments passed to the method.
   */
  args: unknown[]
}

export type PayloadMethod<T> = (
  payload: Payload<T>,
) => Promise<unknown> | unknown

/**
 * Agent.
 */
export type Agent<A, B> = {
  /**
   * Whether or not to log debugging information.
   */
  debug: boolean
  /**
   * The name of the agent. Defaults to either 'alice' or 'bob' depending
   * on the constructor used, Alice or Bob.
   * @override
   */
  name: string
  /**
   * The send method overriden by the user to any transport.
   * @override
   */
  send: PayloadMethod<Agent<B, A>>
  /**
   * Returns the send method. Used in contexts where it might
   * change between sessions, like browser refresh/hot/livereload.
   * @override
   */
  deferredSend: () => PayloadMethod<Agent<B, A>>
  /**
   * Called by the user with the payload when it is received from their transport.
   * @private
   */
  receive: PayloadMethod<Agent<A, B>>

  serializer: (data: unknown) => any
  deserializer: (data: unknown) => any

  /**
   * Overridable logging function. Defaults to `console.log()` and prepends `agent.name`.
   * @override
   */
  log: (...args: unknown[]) => void
  /**
   * Called with the return result of the remote procedure call.
   * @private
   */
  __resolve__: (id: number, result: unknown) => void
  /**
   * Called when remote procedure threw an error and was rejected.
   * @private
   */
  __reject__: (id: number, message: string) => void
} & A

/**
 * AliceBob class.
 *
 * @template A The local interface
 * @template B The remote interface
 */
export class AliceBob<A, B> {
  /**
   * Callback incremental id.
   */
  private id = -1
  /**
   * The callbacks map.
   */
  private callbacks = new Map()

  /**
   * The local Agent.
   */
  local: Agent<A, B> & { target?: A }
  /**
   * The remote Agent.
   */
  remote: Agent<B, A>

  private send: PayloadMethod<Agent<B, A>>
  /**
   * @private
   */
  private receive: PayloadMethod<Agent<A, B>>

  serializer = (data: any) => data
  deserializer = (data: any) => data

  /**
   * Creates an instance of AliceBob.
   * @param [send] The `send` payload method provided by the user. Will be called with a payload to be sent.
   */
  constructor(send?: PayloadMethod<Agent<A, B>>) {
    /**
     * Sends message using the agent's send method.
     *
     * @private
     * @param payload
     */
    this.send = ({ id, method, args }) => {
      if (this.local.debug) {
        this.local.log(
          ' ├> SEND ├>',
          `${id} ${this.local.name}`.padEnd(12),
          '│',
          method,
          args
        )
      }
      return this.local.send({ id, method, args: this.local.serializer(args) })
    }

    /**
     * Receives the message and calls the necessary callbacks.
     *
     * @private
     * @param payload
     */
    this.receive = async ({ id, method, args }) => {
      if (this.local.debug) {
        this.local.log(
          '<┤  RECV │',
          `${this.remote.name} ${id}`.padStart(12),
          '<┤',
          method,
          args
        )
      }

      let error: Error | void
      let result: unknown

      const fn = this.local[method] ?? (this.local.target as any)?.[method]
      if (typeof fn !== 'function') {
        throw new TypeError(
          `Agent method "${method.toString()}" is not a function. Instead found: ${typeof fn}`
        )
      }

      const hasCallback = typeof method === 'string' && method[0] !== '_'

      try {
        result = await fn.apply(this.local.target, this.local.deserializer(args))

        if (hasCallback) {
          await this.send({
            id: ++this.id,
            method: '__resolve__',
            args: [id, result],
          })
        }
      } catch (e: unknown) {
        error = e as Error

        if (hasCallback) {
          await this.send({
            id: ++this.id,
            method: '__reject__',
            args: [id, error],
          })
        }
      } finally {
        // we log instead of throwing because the
        // error belongs to the caller(remote).
        // we don't want the remote to be able to
        // raise exceptions in our execution thread
        if (error && this.local.debug) this.local.log(error)
      }

      return result
    }

    this.local = {
      debug: false,
      name: 'local',
      send: send
        ?? (data => {
          if (this.local.deferredSend)
            return this.local.deferredSend()(data)
          else {
            throw new TypeError(
              `${this.local.name}.send(payload) method must be provided.`
            )
          }
        }),
      receive: this.receive,
      serializer: this.serializer,
      deserializer: this.deserializer,
      log: (...args: unknown[]) => console.log(this.local.name.padStart(10) + ':', ...args),
      __resolve__: (id, result) => pop(this.callbacks, id).resolve(result),
      __reject__: (id, error) => pop(this.callbacks, id).reject(error),
    } as Agent<A, B>

    this.remote = new Proxy<typeof this.remote>(
      <typeof this.remote> {
        name: 'remote',
      },
      {
        get: (target: Record<string | symbol, unknown>, prop) => {
          if (prop in target)
            return target[prop]
          else {
            const method = prop as keyof B
            return async (...args: unknown[]) => {
              const id = ++this.id
              const promise = new Promise((resolve, reject) => this.callbacks.set(id, { resolve, reject }))

              await this.send({ id, method, args })

              const result = await promise
              return result
            }
          }
        },
        set: (target: Record<string | symbol, unknown>, prop, value) => {
          target[prop] = value
          return true
        },
      }
    )
  }

  // TODO: unfortunately these cannot be typed
  // correctly as we cannot have tuple generator types
  // but in the future this might change so we keep it
  // because it allows for:
  //
  // const [alice, bob] = new Alice()
  //
  // *[Symbol.iterator]() {
  //   yield this.local
  //   yield this.remote
  // }

  /**
   * Returns the agents tuple `[alice, bob]`.
   *
   * Example:
   * ```ts
   * const [alice, bob] = new Alice<Local, Remote>().agents()
   *
   * // to enable debugging on local (alice)
   * const [alice, bob] = new Alice<Local, Remote>().agents({ debug: true })
   *
   * // use different names:
   * const [alice, bob] = new Alice<Local, Remote>().agents(
   *   { name: 'server', debug: true },
   *   { name: 'client' }
   * )
   * ```
   *
   * @param [local] Local agent overrides.
   * @param [remote] Remote agent overrides.
   */
  agents(
    local?: Partial<Agent<A, B>> | null,
    remote?: Partial<Agent<B, A>> | null,
  ) {
    Object.assign(this.local, local)
    Object.assign(this.remote, remote)
    return [this.local, this.remote] as [typeof this.local, typeof this.remote]
  }
}

/**
 * Alice class.
 *
 * @template A The local interface
 * @template B The remote interface
 */
export class Alice<A, B> extends AliceBob<A, B> {
  /**
   * Creates an instance of Alice.
   * @param [send] The `send` payload method provided by the user. Will be called with a payload to be sent.
   */
  constructor(send?: PayloadMethod<Agent<A, B>>, target?: A) {
    super(send)

    this.local.name = 'alice'
    this.local.target = target || this.local

    this.remote.name = 'bob'
  }
}

/**
 * Bob class.
 *
 * @template A The local interface
 * @template B The remote interface
 */
export class Bob<A, B> extends AliceBob<A, B> {
  /**
   * Creates an instance of Bob.
   * @param [send] The `send` payload method provided by the user. Will be called with a payload to be sent.
   */
  constructor(send?: PayloadMethod<Agent<A, B>>, target?: A) {
    super(send)

    this.local.name = 'bob'
    this.local.target = target || this.local

    this.remote.name = 'alice'
  }
}
