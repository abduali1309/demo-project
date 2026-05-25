import moment from "moment";
export function checkForLogSequence(
	previousLog: any,
	currentLog: any,
	isLastlog: boolean
) {
	const prevStartDate = previousLog?.start_date;
	const prevEndDate = previousLog?.end_date;

	const curStartDate = currentLog?.start_date;
	const curEndDate = currentLog?.end_date;

	const checkForPreviousStartDate =
		prevStartDate == null || prevStartDate === undefined; // todo: add more checks

	const checkForPreviousEndDate =
		prevEndDate == null || prevEndDate === undefined;

	const checkForCurrentStartDate =
		curStartDate == null || curStartDate === undefined;

	const checkForCurrentEndDate = curEndDate == null || curEndDate === undefined;

	if (checkForPreviousStartDate) {
		console.log(
			previousLog?.id,
			previousLog?.start_date,
			previousLog?.end_date
		);
		throw new Error("Previous log start date is not defined");
	} else if (checkForPreviousEndDate) {
		console.log(
			previousLog?.id,
			previousLog?.start_date,
			previousLog?.end_date
		);
		throw new Error("Previous log end date is not defined");
	} else if (checkForCurrentStartDate) {
		console.log(currentLog?.id, currentLog?.start_date, currentLog?.end_date);
		throw new Error("Current log start date is not defined");
	} else if (checkForCurrentEndDate) {
		if (isLastlog) {
			console.log(currentLog?.id, currentLog?.start_date, currentLog?.end_date);
		} else {
			console.log(currentLog?.id, currentLog?.start_date, currentLog?.end_date);
			throw new Error("Current log end date is not defined");
		}
	}

	const prevEndDateMoment = moment(prevEndDate);
	const curStartDateMoment = moment(curStartDate);

	return prevEndDateMoment.isSame(curStartDateMoment);
}
