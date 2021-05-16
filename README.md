## Gitlab to notion synchronizer

Inspired by official notion's example of [github to notion sync](https://github.com/makenotion/notion-sdk-js/blob/main/examples/github-issue-sync/package.json)

> ⚠️ It's still an early PoC, use at your own risk.
> User UX is still very rough, and output is pretty ugly

Currently, it only supports gitlab's groups, but you can change the code (change `group_id` to `project_id` in the gitlab API call).

To run it:

```
% yarn
% export DATABASE_ID="UUID_OF_YOUR_DATABASE"
% export GITLAB_GROUP_ID="name_of_your_gitlab_team"
% export GITLAB_TOKEN="your_gitlab_secret_token"
% export GITLAB_TOKEN="your_notion_secret_token"
% yarn start
```

