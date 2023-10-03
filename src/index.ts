import fs from "fs"
import assert from "assert"

import * as core from "@actions/core"
import { backOff } from "exponential-backoff"

import {
  ECS,
  Task,
  TaskDefinition,
  DescribeTasksCommand,
} from "@aws-sdk/client-ecs"

import { tailTaskLogs } from "./logs"
import { waitUntilTasksStopped } from "./util"

async function run(): Promise<void> {
  try {
    // retrieve all required inputs
    const env = core.getInput("perx_env", { required: true })
    const region = core.getInput("perx_region", { required: true })
    const appName = core.getInput("perx_app_name", { required: true })
    const taskDefPath = core.getInput("definition", { required: true })

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

    const awsRegion = region === "au" ? "ap-southeast-2" : "us-east-2"
    const ecs = new ECS({ region: awsRegion })

    let taskDefinition: TaskDefinition
    let startedTasks: Task[] = []

    // read task definition from local disk and register it with aws
    await core.group("Registering task definition...", async () => {
      const source = fs.readFileSync(taskDefPath).toString()
      const config = JSON.parse(source)
      await ecs.registerTaskDefinition(config).then((result) => {
        if (result.taskDefinition) {
          taskDefinition = result.taskDefinition
          core.info(`Success! ${taskDefinition.taskDefinitionArn}`)
          core.setOutput(
            "task-definition-arn",
            taskDefinition.taskDefinitionArn
          )
        } else {
          core.setFailed("Could not register task definition")
        }
      })
    })

    // start the containers
    await core.group("Starting tasks...", async () => {
      const securityGroups = core.getInput("security_groups") || ""
      const subnets = core.getInput("subnets") || ""

      const { tasks = [], failures = [] } = await ecs.runTask({
        cluster: env,
        taskDefinition: taskDefinition?.taskDefinitionArn,
        networkConfiguration: {
          awsvpcConfiguration: {
            securityGroups: securityGroups.split(","),
            subnets: subnets.split(","),
          },
        },
      })

      if (tasks.length > 0 && failures.length === 0) {
        core.info("All tasks started successfully!")
      } else {
        core.info(`${tasks.length} tasks have started`)
        core.info(`${failures.length} tasks failed to start`)
      }

      core.setOutput("tasks-started-count", tasks.length)
      core.setOutput("tasks-started-failed-count", failures.length)
      startedTasks = tasks
    })

    // take action on tasks successfully requested
    if (startedTasks.length > 0) {
      // build a list of all the task's arns, so we can target them
      const taskArns = startedTasks.reduce<string[]>((arns, task) => {
        if (task.taskArn) arns.push(task.taskArn)
        return arns
      }, [])

      // set task arns as comma delimited string output
      core.setOutput("task-arns", taskArns.join(","))

      // wait until all tasks have completed running,
      // regardless of success or failure
      await core.group("Monitoring RUNNING tasks...", async () => {
        taskArns.map(core.info)

        core.info("========== TASK LOGS ==========")

        // prepare an abort controller to toggle off CloudWatch tailing
        const logController = new AbortController()

        tailTaskLogs({
          groupName: `/ecs/${env}/${appName}`,
          streamPrefix: appName,
          taskName: appName,
          taskArn: taskArns[0],
          region: awsRegion,
          signal: logController.signal,
        })

        await backOff(
          () => waitUntilTasksStopped({ client: ecs, cluster: env, taskArns }),
          { delayFirstAttempt: true, maxDelay: 10000, numOfAttempts: 1000 }
        )

        // no longer poll for logs and let the process exit
        logController.abort()
      })

      // all tasks have stopped, so we need to inspect the
      // results and fail/pass the job accordingly
      await core.group("Resolving results of STOPPED tasks...", async () => {
        const taskDescriptions = await ecs.send(
          new DescribeTasksCommand({
            tasks: taskArns,
            cluster: env,
          })
        )

        if (!taskDescriptions.tasks) {
          throw new Error("Could not retrieve stopped tasks")
        }

        const containers = taskDescriptions.tasks.flatMap(
          (task) => task.containers || []
        )

        if (containers.every((container) => container.exitCode === 0)) {
          core.info("All tasks completed successfully!")
        } else {
          const codes = containers.map(
            (container) => container.exitCode || "N/A"
          )
          core.setFailed(
            `Some tasks exited with a non 0 code: ${codes.join(", ")}`
          )
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
