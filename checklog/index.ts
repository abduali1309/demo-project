import axios from "axios";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import moment from "moment-timezone";
import { checkForLogSequence } from "./check-log-sequence";
import { Log } from "./Log";

// Extend dayjs with the isSameOrBefore plugin
dayjs.extend(isSameOrBefore);
const data = require("./logs.json");

// const beforeLogs = require("./before-logs.json");
// const afterLogs = require("./after-logs.json");

const BASE_URL = "https://front-api-aws.ontime-logs.com/";
const DRIVER_UID = "0c334a17-8843-4984-831a-11a2ea02e946";
const COMPANY_UID = "782b1394-0b7b-48b9-bfc9-ce5377e4f406";
const AUTHORIZATION =
	"4Vv6BEq0alSXuLTB9F9DiHNMh4vAifpGwVNVvXR0SdrzgWgeoEr0tN2GYcZz5uG6";
const START_DATE = "2026-02-03";
const END_DATE = "2026-02-06";

const MILLISECONDS = 3_600_000;

const api = axios.create({
	baseURL: BASE_URL,
	headers: {
		Authorization: AUTHORIZATION,
		Companyuid: COMPANY_UID,
	},
});

/*
returns ISO String date
2020-01-01T11:00:00.000Z
*/
function formatDate(date: Date): string {
	date = new Date(date);
	const iso = date.toISOString().split("T")[0];
	return `${iso}T11:00:00.000Z`;
}

/*
returns DD-MM-YYYY format
01-01-2020
*/
function formatDateV2(date: string): string {
	const dateObject = new Date(date);
	return dateObject.toLocaleDateString("en-BG", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
}

async function fetchLogs(date: string) {
	const url = `api/dashboards/get-daily-logs/${DRIVER_UID}/${date}`;
	const response = await api.get(url);
	return response.data.logs;
}

async function checkMalf() {
	const url = `/logs/new-malfunction-insert/${DRIVER_UID}?from_date=${formatDateV2(
		START_DATE
	)}&to_date=${formatDateV2(END_DATE)}`;
	const response = await api.post(url);
	return response.data;
}

function getInfoLogs(data: Log[]): Map<Log, Log[]> {
	const dutyLog = data
		.filter(
			(e: any): any =>
				(e.event_type == 1 && (e.event_code >= 1 || e.event_code <= 4)) ||
				(e.event_type == 3 && (e.event_code == 1 || e.event_code == 2))
		)
		.reverse();
	const infoLogs = data
		.filter(
			(e: any): any =>
				e.event_type != 1 || e.event_type != 3 || e.event_type != 7
		)
		.reverse(); // todo: can I improve it? I mean instead of using two filters use only one and sort 'em out
	let map = new Map<Log, Log[]>();
	dutyLog.forEach((duty, index) => {
		if (duty.end_date === null && index === dutyLog.length - 1) {
			duty.end_date = moment().toISOString();
		}
		map.set(duty, []);
		infoLogs.forEach((info) => {
			// todo: O(n^2) need to fix => shit code karoche
			if (
				moment(info.start_date).isBetween(duty.start_date, duty.end_date) &&
				moment(info.end_date).isBetween(duty.start_date, duty.end_date)
			) {
				if (!map.has(duty)) {
					map.set(duty, []); // todo: need to check map functions
				} else map.get(duty)!.push(info);
			}
		});
	});
	return map;
}

function checkForInfoLogs(data: Map<Log, Log[]>): ErrorLog {
	let response: ErrorLog = {};
	for (let log of data.entries()) {
		const dutyLog = log[0];
		const infoLogsArray = log[1];
		if (checkLog(dutyLog, "driving")) {
			const duration = moment(dutyLog.end_date).diff(
				dutyLog.start_date,
				"hours"
			);
			if (duration !== infoLogsArray.length) {
				return { log: dutyLog, infoLog: infoLogsArray };
			}
			console.log(infoLogsArray);
			infoLogsArray.forEach((info) => {
				if (!checkLog(info, "inter")) {
					response = {
						log: dutyLog,
						infoLog: infoLogsArray,
						message: "Info log is set incorrectly",
					};
					// console.log(response)
					throw new Error(`${info.status} log is set incorrectly`);
				} else if (
					moment(info.start_date).diff(dutyLog.start_date, "milliseconds") %
						MILLISECONDS !==
					0
				) {
					console.log(
						moment(info.start_date).diff(dutyLog.start_date, "milliseconds") %
							MILLISECONDS
					);
					response = { log: dutyLog, infoLog: infoLogsArray };
					console.log(response);
					throw new Error("Intermediate is incorrectly placed");
				} else {
					throw new Error("Something went wrong");
				}
			});
		} else if (checkLog(dutyLog, "rest")) {
			if (infoLogsArray.length === 0) {
				continue;
			}
			infoLogsArray.forEach((e) => {
				if (!checkLog(e, "info")) {
					throw new Error("Incorrect info logs");
				}
			});
		}
	}
	return response;
}

function analyzeLogs(logs: Map<Log, Log[]>): boolean {
	for (let log of logs.entries()) {
		let dutyLog = log[0];
	}

	return false;
}

async function main() {
	let curDate = dayjs(START_DATE);
	const lastDate = dayjs(END_DATE);
	let errCount = 0;
	while (curDate.isSameOrBefore(lastDate)) {
		const response = await fetchLogs(formatDate(curDate.toDate()));
		// const response = data;
		// const getMap = getInfoLogs(response);
		// const infos = checkForInfoLogs(getMap);
		// console.log(infos);
		// console.log(getMap)

		const dutyLog = response.filter(
			(e: any): any =>
				(e.event_type == 1 && (e.event_code >= 1 || e.event_code <= 4)) ||
				(e.event_type == 3 && (e.event_code == 1 || e.event_code == 2))
		);
		const reversedLogs = dutyLog.toReversed();
		for (let i = 0; i < dutyLog.length - 1; i++) {
			if (
				!checkForLogSequence(
					dutyLog[i],
					dutyLog[i + 1],
					i == dutyLog.length - 1
				)
			) {
				console.log("First duty log ", dutyLog[i]?.end_date);
				console.log("Second duty log", dutyLog[i + 1]?.start_date);
				errCount++;
			}
		}

		curDate = curDate.add(1, "day");
	}
	console.log("Error count : ", errCount);
}

main();

type ErrorLog = {
	log?: Log;
	infoLog?: Log | Log[];
	logId?: number;
	start_date?: string;
	end_date?: string;
	message?: string;
};

function checkLog(log: Log, status: string): boolean {
	if (status == "off") {
		return log.event_type === 1 && log.event_code === 1;
	} else if (status == "sleep") {
		return log.event_type === 1 && log.event_code === 2;
	} else if (status == "driving") {
		return log.event_type === 1 && log.event_code === 3;
	} else if (status == "on") {
		return log.event_type === 1 && log.event_code === 4;
	} else if (status == "personal") {
		return log.event_type === 3 && log.event_code === 1;
	} else if (status == "yard") {
		return log.event_type === 3 && log.event_code === 2;
	} else if (status == "inter" || status == "intermediate") {
		return (
			log.event_type === 2 && (log.event_code === 1 || log.event_code === 2)
		);
	} else if (status == "certify") {
		return log.event_type === 4 && (log.event_code >= 1 || log.event_code <= 9);
	} else if (status == "login") {
		return log.event_type === 5 && log.event_code >= 1;
	} else if (status == "logout") {
		return log.event_type === 5 && log.event_code >= 2;
	} else if (status == "poweron") {
		return (
			log.event_type === 6 && (log.event_code === 1 || log.event_code === 2)
		);
	} else if (status == "poweroff") {
		return (
			log.event_type === 6 && (log.event_code === 3 || log.event_code === 4)
		);
	} else if (status == "malf" || status == "malfunction") {
		return (
			log.event_type === 7 && (log.event_code === 1 || log.event_code === 2)
		);
	} else if (status == "diag" || status == "diagnostics") {
		return (
			log.event_type === 7 && (log.event_code === 3 || log.event_code === 4)
		);
	} else if (status == "auth") {
		return (
			log.event_type === 5 && (log.event_code === 1 || log.event_code === 2)
		);
	} else if (status == "info") {
		return log.event_type != 1 && log.event_type != 3 && log.event_code <= 9;
	} else if (status == "adverse") {
		return log.event_type === 11 && log.event_code === 0;
	} else if (status == "shorthaul") {
		return log.event_type === 22 && log.event_code === 1;
	} else if (status == "duty") {
		return log.event_type === 1 || log.event_type === 3;
	} else if (status == "all-driving") {
		return (
			(log.event_type === 1 && log.event_code === 3) ||
			(log.event_type === 3 && (log.event_code === 1 || log.event_code === 2))
		);
	} else if (status == "rest") {
		return (
			log.event_type === 1 && (log.event_code === 1 || log.event_code === 2)
		);
	} else return false;
}
