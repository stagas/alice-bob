// alice

import { fork } from 'child_process'
import { join } from 'path'

import { Alice } from '../../src'

// we import Bob's interface and call it Remote
// bob will show as Agent<Remote> in intellisense
import type { Interface as Remote } from './bob'

export interface Interface {
  hiya: (message: { from: string }) => Promise<void>
}

// for intellisense reasons we alias our interface to `Local`
// so that alice shows as Agent<Local> and bob as Agent<Remote>
type Local = Interface

// start bob
const child = fork(join(__dirname, 'bob'))

// create an Alice instance with given `send` function as the
// constructor parameter. Note that Alice, Bob both inherit from
// the AliceBob class, the only thing they change is they have
// the names "alice" and "bob" preconfigured in their agents
const [alice, bob] = new Alice<Local, Remote>(
  data => void child.send(data)
).agents()

// all messages from bob passed to alice.receive
child.on('message', alice.receive)

// we can set debug=true|false at any time
alice.debug = true

// methods can be added also lazily at any time at any scope..
alice.hiya = async ({ from }) => {
  alice.log(from, 'says: hiya!')
  // => alice: bob says: hiya!
  // `agent.log()` prepends the agent's name to the output
}

const sayHello = async () => {
  const result = await bob.hello('there', { iam: alice.name })
  alice.log('bob responded with:', result)
  // => alice: bob responded with: hi alice

  process.exit(0)
}

sayHello()
