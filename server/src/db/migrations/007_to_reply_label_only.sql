-- B28b (PLAN §14.1 decision 1): the To Reply rule labels only. Installs seeded with the old
-- default (label + draft_reply) are reset to label; AI drafting happens only when asked.
UPDATE rules SET actions_json = '["label"]'
WHERE id = 'to_reply' AND actions_json LIKE '%draft_reply%';
