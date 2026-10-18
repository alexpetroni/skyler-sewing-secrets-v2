import * as v from 'valibot';

/**
 * Bunny Stream's webhook body: `{ VideoLibraryId, VideoGuid, Status }`
 * (3 encoding, 4 finished, 5 failed). The library id arrives as a number;
 * it is compared as a string with the configured one.
 */
export const bunnyWebhookSchema = v.object({
	VideoLibraryId: v.pipe(
		v.union([v.pipe(v.number(), v.integer()), v.pipe(v.string(), v.regex(/^\d+$/))]),
		v.transform(String)
	),
	VideoGuid: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
	Status: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))
});
export type BunnyWebhookBody = v.InferOutput<typeof bunnyWebhookSchema>;
