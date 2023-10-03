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
exports.waitUntilTasksStopped = void 0;
const client_ecs_1 = require("@aws-sdk/client-ecs");
function waitUntilTasksStopped(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const taskDescriptions = yield params.client.send(new client_ecs_1.DescribeTasksCommand({
            tasks: params.taskArns,
            cluster: params.cluster,
        }));
        return new Promise((resolve, reject) => {
            var _a;
            const isStopped = (_a = taskDescriptions.tasks) === null || _a === void 0 ? void 0 : _a.every((task) => {
                return task.lastStatus === "STOPPED" || task.desiredStatus === "STOPPED";
            });
            if (isStopped) {
                resolve();
            }
            else {
                reject();
            }
        });
    });
}
exports.waitUntilTasksStopped = waitUntilTasksStopped;
