import { createInterface } from 'node:readline'

export function askForApproval(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  })

  return new Promise((resolve) => {
    rl.question('Allow install? [y/N] ', (answer) => {
      rl.close()
      const input = answer.trim().toLowerCase()
      resolve(input === 'y' || input === 'yes')
    })
  })
}
