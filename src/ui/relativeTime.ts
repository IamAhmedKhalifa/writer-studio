/**
 * Plain-English "when" labels for the sidebar. Pure, so it is unit tested.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function describeWhen(timestamp: number, now: number = Date.now()): string {
	const elapsed = now - timestamp

	if (elapsed < 0) {
		return "just now"
	}
	if (elapsed < MINUTE) {
		return "just now"
	}
	if (elapsed < HOUR) {
		const minutes = Math.floor(elapsed / MINUTE)
		return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
	}
	if (elapsed < DAY) {
		const hours = Math.floor(elapsed / HOUR)
		return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
	}

	const days = Math.floor(elapsed / DAY)
	if (days === 1) {
		return "yesterday"
	}
	if (days < 7) {
		return `${days} days ago`
	}
	if (days < 14) {
		return "last week"
	}
	if (days < 60) {
		const weeks = Math.floor(days / 7)
		return `${weeks} weeks ago`
	}

	const months = Math.floor(days / 30)
	if (months < 12) {
		return `${months} months ago`
	}

	const years = Math.floor(days / 365)
	return `${years} ${years === 1 ? "year" : "years"} ago`
}
