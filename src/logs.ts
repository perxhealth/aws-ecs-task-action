import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  CreateLogStreamCommand,
} from "@aws-sdk/client-cloudwatch-logs"

interface TailLogsParams {
  cursor?: string
  streamPrefix?: string
  logStreamExists?: boolean
  groupName: string
  taskName: string
  taskArn: string
}

export async function tailTaskLogs(params: TailLogsParams): Promise<void> {
  const {
    cursor,
    streamPrefix,
    groupName,
    taskArn,
    taskName,
    logStreamExists = false,
  } = params

  const cloudwatch = new CloudWatchLogsClient({ region: "ap-southeast-2" })

  const taskId = taskArn.split("/").at(-1)
  const taskSuffix = `${taskName}/${taskId}`
  const streamName = streamPrefix ? `${streamPrefix}/${taskSuffix}` : taskSuffix

  // eagerly create the projected log stream if necessary
  if (!logStreamExists) {
    try {
      await cloudwatch.send(
        new CreateLogStreamCommand({
          logStreamName: streamName,
          logGroupName: groupName,
        })
      )
    } catch (e) {
      // doesn't matter
    }
  }

  const logs = await cloudwatch.send(
    new GetLogEventsCommand({
      startFromHead: true,
      logStreamName: streamName,
      logGroupName: groupName,
      nextToken: cursor,
    })
  )

  if (logs.events) {
    for (const event of logs.events) {
      console.log("LOG: ", event.message)
    }
  }

  if (logs.nextForwardToken) {
    setTimeout(
      () =>
        tailTaskLogs({
          ...params,
          logStreamExists: true,
          cursor: logs.nextForwardToken,
        }),
      2000
    )
  }

  return Promise.resolve()
}
