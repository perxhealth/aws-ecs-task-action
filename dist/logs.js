"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tailTaskLogs = void 0;
const client_cloudwatch_logs_1 = require("@aws-sdk/client-cloudwatch-logs");
function tailTaskLogs(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { cursor, streamPrefix, groupName, taskArn, taskName, signal, region, logStreamExists = false, } = params;
        const cloudwatch = new client_cloudwatch_logs_1.CloudWatchLogsClient({ region });
        const taskId = taskArn.split("/").at(-1);
        const taskSuffix = `${taskName}/${taskId}`;
        const streamName = streamPrefix ? `${streamPrefix}/${taskSuffix}` : taskSuffix;
        // eagerly create the projected log stream if necessary
        if (!logStreamExists) {
            try {
                yield cloudwatch.send(new client_cloudwatch_logs_1.CreateLogStreamCommand({
                    logStreamName: streamName,
                    logGroupName: groupName,
                }));
            }
            catch (e) {
                // doesn't matter
            }
        }
        const logs = yield cloudwatch.send(new client_cloudwatch_logs_1.GetLogEventsCommand({
            startFromHead: true,
            logStreamName: streamName,
            logGroupName: groupName,
            nextToken: cursor,
        }));
        if (logs.events) {
            for (const event of logs.events) {
                console.log("LOG: ", event.message);
            }
        }
        if (logs.nextForwardToken) {
            if (!signal.aborted) {
                setTimeout(() => {
                    tailTaskLogs(Object.assign(Object.assign({}, params), { logStreamExists: true, cursor: logs.nextForwardToken }));
                }, 2000);
            }
        }
        return Promise.resolve();
    });
}
exports.tailTaskLogs = tailTaskLogs;
