# Community (friends, posts, comments, likes, chat)

The **Community** tab lets signed-in people pick a username, add friends, share posts (text + one
photo, optionally with today's calorie totals), like and comment, and chat with friends.

## Setup (once)

1. Accounts must already work (see `docs/DATABASE.md`).
2. Supabase → **SQL Editor** → **New query** → paste all of `supabase/community.sql` → **Run**.
   It creates the tables, the privacy rules, the private `post-images` storage bucket and turns on
   live updates for chat. Running it again is safe.
3. Redeploy the app (Render does this on every push). Nothing to add to the environment.

## Who sees what

Enforced by the database's row level security, not just the app:

| | Who can see it |
|---|---|
| Post marked **Friends** (default) | The author and their friends |
| Post marked **Public** | Every signed-in user (Explore) |
| Photos | Stored in a private bucket; only people who can see the post get a link (valid 1 hour) |
| Likes, comments | People who can see the post |
| Messages | Only the two people in the conversation; only friends can message each other |
| Diary, goals, weight | Never shared. Only what someone posts is visible |

Blocking someone ends the friendship and hides each other's posts, comments and messages.

## Moderation (required by the App Store for user-generated content)

The app has the pieces Apple asks for (guideline 1.2): people must accept the community rules
before joining, can **report** posts, comments and people, and can **block** anyone.

Reports go to the `reports` table. Check it regularly (Apple expects action within 24 hours):

1. Supabase → **Table Editor** → `reports` (newest first). `target_type` + `target_id` say what was
   reported.
2. To remove a post: Table Editor → `posts` → find the `id` → delete the row (likes and comments go
   with it). Same for `comments`.
3. To ban someone: **Authentication** → **Users** → find them → **Delete user** (removes their
   profile, posts, comments and messages).

## Limits

- Post text up to 2000 characters, comments 1000, messages 2000. One photo per post, resized to
  1280 px JPEG before upload (bucket limit 3 MB). Supabase's free plan includes 1 GB of storage.
- Chat updates live while the app is open; there are no push notifications for messages yet.
