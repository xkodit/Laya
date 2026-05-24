-- Partial unique indexes so a user can have at most one rating (up XOR down)
-- AND at most one report per message. Rating and report are independent rows
-- so a user can downvote and report the same answer simultaneously.

create unique index message_feedback_rating_unique
  on message_feedback(message_id, user_id)
  where rating in ('up', 'down');

create unique index message_feedback_report_unique
  on message_feedback(message_id, user_id)
  where rating = 'report';
