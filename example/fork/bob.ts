// bob

import { Bob } from '../../src'
import type { Interface as Remote } from './alice'

export interface Interface {
  hello: (message: string, data: { iam: string }) => Promise<string>
}

type Local = Interface

const [bob, alice] = new Bob<Local, Remote>().agents({ debug: true })

process.on('message', bob.receive)

// send method can be provided at any time
bob.send = data => void process.send!(data)

bob.hello = async (message, { iam }) => {
  bob.log(iam + ' says: hello ' + message)

  // we can call alice methods as well
  await alice.hiya({ from: 'bob' })

  // if we throw here the remote's `await`
  // will throw as well with this message
  // throw new Error('failed :(')

  return 'hi ' + iam
}
