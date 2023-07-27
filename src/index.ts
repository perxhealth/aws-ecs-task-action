import fs from "fs"
import assert from "assert"

import {
  ECS,
  waitUntilTasksRunning,
  waitUntilTasksStopped,
} from "@aws-sdk/client-ecs"

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

    // ensure AWS_REGION was picked up from the environment
    assert(
      process.env.AWS_REGION,
      "`AWS_REGION` is not set in the environment. Has a previous action setup AWS credentials?"
    )

    // run the nominated task and collect the results
    const ecs = new ECS({ region: process.env.AWS_REGION })
    const { tasks, failures } = await ecs.runTask({
      taskDefinition: taskDefPath,
    })

    // log failures if they exist
    if (failures && failures.length > 0) {
      core.info(`${failures.length} tasks did not start successfully`)
    }

    // take action on tasks successfully requested
    if (tasks) {
      // grab the task ARNs
      const taskArns = tasks.map((task) => task.taskArn!)

      // wait for tasks to begin running
      await core.group("Waiting for RUNNING state...", async () => {
        await waitUntilTasksRunning(
          { client: ecs, maxWaitTime: 60 },
          { tasks: taskArns }
        )
      })

      // update logs
      core.info("All tasks have entered RUNNING state")

      // wait for tasks to complete and report the result
      await core.group("Waiting for STOPPED state...", async () => {
        const waiter = await waitUntilTasksStopped(
          { client: ecs, maxWaitTime: 3600 },
          { tasks: taskArns }
        )
        if (waiter.state !== "SUCCESS") {
          core.setFailed(waiter.reason.toString())
        }
      })
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

run()
