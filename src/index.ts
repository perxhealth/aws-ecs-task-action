import fs from "fs"
import assert from "assert"
import { emojify } from "node-emoji"

import * as core from "@actions/core"

async function run(): Promise<void> {
  try {
    // retrieve all required inputs
    const taskDefPath = core.getInput("task-definition", { required: true })

    // ensure the task definition file exists on disk
    assert(
      fs.existsSync(taskDefPath),
      `Path specified in 'task-definition' input does not exist: ${taskDefPath}`
    )

    // ensure AWS_ACCESS_KEY_ID was picked up from the environment
    assert(
      process.env.AWS_ACCESS_KEY_ID,
      "`AWS_ACCESS_KEY_ID` is not set in the environment. Has a previous action setup AWS credentials?"
    )

    // ensure AWS_SECRET_ACCESS_KEY was picked up from the environment
    assert(
      process.env.AWS_SECRET_ACCESS_KEY,
      "`AWS_SECRET_ACCESS_KEY` is not set in the environment. Has a previous action setup AWS credentials?"
    )

    // 1. register the task's definition

    // 2. run the task, and wait for it to complete
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

run()
