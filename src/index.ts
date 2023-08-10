import fs from "fs"
import assert from "assert"

import * as core from "@actions/core"
import { backOff } from "exponential-backoff"

import {
  ECS,
  DescribeTasksCommand,
  DescribeTasksCommandOutput,
} from "@aws-sdk/client-ecs"

async function run(): Promise<void> {
  try {
    // retrieve all required inputs
    // const env = core.getInput("perx_env", { required: true })
    // const region = core.getInput("perx_region", { required: true })
    // const taskDefPath = core.getInput("definition", { required: true })
    const taskDefPath = "./task-definition.json"

    // ensure the task definition file exists on disk
    assert(
      fs.existsSync(taskDefPath),
      `Path specified in 'task-definition' input does not exist: ${taskDefPath}`
    )

    /*
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
    */

    // run the nominated task and collect the results
    const ecs = new ECS({ region: process.env.AWS_REGION })

    // read task definition from local disk and register it with aws
    const definition = fs.readFileSync(taskDefPath).toString()
    const { taskDefinition } = await ecs.registerTaskDefinition(
      JSON.parse(definition)
    )

    // start the containers
    const { tasks, failures } = await ecs.runTask({
      cluster: "dev",
      taskDefinition: taskDefinition?.taskDefinitionArn,
      networkConfiguration: {
        awsvpcConfiguration: {
          securityGroups: ["sg-027a4bdaa804a13dd"],
          subnets: [
            "subnet-06a351d84c3c1734f",
            "subnet-0ec4c58f9d0ec871e",
            "subnet-08949a30b96c117e2",
          ],
        },
      },
    })

    // log failures if they exist
    if (failures && failures.length > 0) {
      core.info(`${failures.length} tasks did not start successfully`)
    }

    // take action on tasks successfully requested
    if (tasks) {
      // build a list of all the task's arns, so we can target them
      const taskArns = tasks.reduce<string[]>((arns, task) => {
        if (task.taskArn) arns.push(task.taskArn)
        return arns
      }, [])

      // cache the command input we'll use to describe the tasks
      const describeCommand = new DescribeTasksCommand({
        tasks: taskArns,
        cluster: "dev",
      })

      // cached reference to when we last inspected the tasks
      let description: DescribeTasksCommandOutput

      // wait until all tasks have completed running,
      // regardless of success or failure
      await core.group(
        "Waiting for STOPPED state on all tasks...",
        async () => {
          taskArns.map(core.info)
          await backOff(
            async () => {
              description = await ecs.send(describeCommand)

              const isStopped = description.tasks?.every(
                (task) => task.lastStatus === "STOPPED"
              )

              if (isStopped) {
                return Promise.resolve()
              } else {
                return Promise.reject()
              }
            },
            { maxDelay: 10000, startingDelay: 10000, delayFirstAttempt: true }
          )
        }
      )

      // all tasks have stopped, so we need to inspect the
      // results and fail/pass the job accordingly
      await core.group("Resolving results of STOPPED tasks...", async () => {
        // Determine success by whether every task's container(s) exited with code 0
        const containers = description.tasks?.flatMap((task) => task.containers)
        const isSuccess = containers?.every(
          (container) => container?.exitCode === 0
        )

        if (isSuccess) {
          core.info("All tasks completed successfully!")
        } else {
          core.setFailed("Some tasks exited with a non 0 code")
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
