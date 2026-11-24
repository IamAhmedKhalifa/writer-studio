import * as assert from "node:assert/strict"
import { describeWhen } from "../src/ui/relativeTime"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime()

describe("describeWhen", () => {
	it("describes the last minute as just now", () => {
		assert.equal(describeWhen(NOW - 5_000, NOW), "just now")
	})

	it("never reports a time in the future", () => {
		assert.equal(describeWhen(NOW + 10_000, NOW), "just now")
	})

	it("uses minutes, then hours", () => {
		assert.equal(describeWhen(NOW - MINUTE, NOW), "1 minute ago")
		assert.equal(describeWhen(NOW - 5 * MINUTE, NOW), "5 minutes ago")
		assert.equal(describeWhen(NOW - HOUR, NOW), "1 hour ago")
		assert.equal(describeWhen(NOW - 3 * HOUR, NOW), "3 hours ago")
	})

	it("says yesterday rather than 1 day ago", () => {
		assert.equal(describeWhen(NOW - DAY, NOW), "yesterday")
	})

	it("counts days within the week", () => {
		assert.equal(describeWhen(NOW - 3 * DAY, NOW), "3 days ago")
	})

	it("uses weeks, months, and years for older work", () => {
		assert.equal(describeWhen(NOW - 8 * DAY, NOW), "last week")
		assert.equal(describeWhen(NOW - 21 * DAY, NOW), "3 weeks ago")
		assert.equal(describeWhen(NOW - 200 * DAY, NOW), "6 months ago")
		assert.equal(describeWhen(NOW - 400 * DAY, NOW), "1 year ago")
		assert.equal(describeWhen(NOW - 900 * DAY, NOW), "2 years ago")
	})
})
