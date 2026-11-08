CREATE VIRTUAL TABLE `search_index` USING fts5(
	kind UNINDEXED,
	ref_id UNINDEXED,
	event_id UNINDEXED,
	text
);
