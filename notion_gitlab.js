/*
Copyright (C) 2021, Bernard `Guyzmo` Pratz <bernard.pratz@zeloce.com>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const database_id = process.env.DATABASE_ID;
const gitlab_group_id = process.env.GITLAB_GROUP_ID;
const auths = {
  gitlab: { oauth_access_token: process.env.GITLAB_TOKEN},
  notion: { oauth_access_token: process.env.NOTION_TOKEN},
}


const { Gitlab } = require('gitlab');
const { Client } = require("@notionhq/client")

const gitlab = new Gitlab({
  oauthToken: auths.gitlab.oauth_access_token
})

const notion = new Client({
  auth: auths.notion.oauth_access_token
})

//Get a paginated list of Tasks currently in a the database.
async function getIssuesFromDatabase() {

    const issues = {};

    async function getPageOfIssues(cursor){
        let request_payload = "";
        //Create the request payload based on the presense of a start_cursor
        if(cursor == undefined){
            request_payload = {
                path:'databases/' + database_id + '/query',
                method:'POST',
            }
        } else {
            request_payload= {
                path:'databases/' + database_id + '/query',
                method:'POST',
                body:{
                    "start_cursor": cursor
                }
            }
        }
        //While there are more pages left in the query, get pages from the database.
        const current_pages = await notion.request(request_payload)

        for(const page of current_pages.results){
            issues[page.properties["Issue Number"].number] = {
                "page_id": page.id,
            }
        }
        if(current_pages.has_more){
            await getPageOfIssues(current_pages.next_cursor)
        }

    }
    await getPageOfIssues();
    return issues;
};

// XXX Still very basic, output is very crude
const fromMarkdownToBlocks = (text) => {
  const out = text.split('\n').map(statement => {
    if (statement.match(/^ *-  */))
      return {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "text": statement.split(/\n|\\n/).map(content =>
            ({
              "type": "text",
              "text": {
                content,
              },
              "annotations": {
                // "bold": false,
                // "italic": false,
                // "strikethrough": false,
                // "underline": false,
                // "code": false,
                // "color": "default"
              },
              "plain_text": content,
            })
          )
        }
      }

    if (statement.match(/^ *\*  */))
      return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "text": statement.split(/\n|\\n/).map(content =>
            ({
              "type": "text",
              "text": {
                content,
              },
              "annotations": {
                // "bold": false,
                // "italic": false,
                // "strikethrough": false,
                // "underline": false,
                // "code": false,
                // "color": "default"
              },
              "plain_text": content,
            })
          )
        }
      }

    if (statement.match(/^ *>  */))
      return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "text": statement.split(/\n|\\n/).map(content =>
            ({
              "type": "text",
              "text": {
                content,
              },
              "annotations": {
                // "bold": false,
                // "italic": false,
                // "strikethrough": false,
                // "underline": false,
                "code": true,
                // "color": "default"
              },
              "plain_text": content,
            })
          )
        }
      }

    if (statement.match(/^ *`/))
      return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "text": statement.split(/\n|\\n/).map(content =>
            ({
              "type": "text",
              "text": {
                content,
              },
              "annotations": {
                // "bold": false,
                // "italic": false,
                // "strikethrough": false,
                // "underline": false,
                "code": true,
                // "color": "default"
              },
              "plain_text": content,
            })
          )
        }
      }

    if (statement.match(/^-? *\[ *] */))
      return {
        "object": "block",
        "type": "to_do",
        "to_do": {
          "text": statement.split(/\n|\\n/).map(content =>
            ({
              "type": "text",
              "text": {
                content,
              },
              "annotations": {
                // "bold": false,
                // "italic": false,
                // "strikethrough": false,
                // "underline": false,
                // "code": false,
                // "color": "default"
              },
              "plain_text": content,
            })
          )
        }
      }

    return {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "text": statement.split(/\n|\\n/).map(content =>
          ({
            "type": "text",
            "text": {
              content,
            },
            "annotations": {
              // "bold": false,
              // "italic": false,
              // "strikethrough": false,
              // "underline": false,
              // "code": false,
              // "color": "default"
            },
            "plain_text": content,
          })
        )
      }
    };
  });
  return out;
};

async function syncIssuesWithDatabase(){
  console.log("Syncing Gitlab Issues with Notion Database")
  const issuesInDatabase = await getIssuesFromDatabase();

  //Get a list of github issues and add them to a local store
  let gitlabIssues = {};

  let currentPage = 0;
  const getIssuesList = async function* getIssuesList () {
    if (currentPage === 1) return [];
    const issues = await gitlab.Issues.all({
      groupId: gitlab_group_id,
      pagination: "offset",
      perPage: 25,
      page: currentPage,
      showExpanded: true
    });
    currentPage = issues.paginationInfo?.next;
    yield issues;
  }

  console.log("Issues in notion: ", issuesInDatabase.length);

  const iterator = getIssuesList();

  for await (const issues of iterator) {
    console.log("Parsing of issues from gitlab: ", issues.length);

    for (const issue of issues) {
      gitlabIssues[issue.iid] = {
        "id": issue.iid,
        "title": issue.title,
        "state": issue.state,
        "comments": issue.comments,
        "link": issue.web_url,
        "labels": issue.labels,
        "milestone": issue.milestone?.title,
        "project": issue.web_url.split('/-/')[0].split('https://gitlab.com/')[1],
        "description": issue.description,
      }
    }
  }

  //Create new issues or update existing in a Notion Database
  for (const [issueNumber, issueDetails] of Object.entries(gitlabIssues)){
    //If the issue does not exist in the database yet, add it to the database
    if(!(issueNumber in issuesInDatabase)){
      console.log(`→ Adds issue ${issueNumber} in database`)
      await notion.request({
        path:'pages',
        method:"POST",
        body:{
          "parent": { "database_id": database_id},
          "properties": {
            "State": {"name": issueDetails.state},
            "Issue Number": parseInt(issueNumber),
            "Name": [
              {
                "text": {
                  "content" : issueDetails.title
                }
              }
            ],
            "Comments": parseInt(issueDetails.comments?.length ?? 0),
            "Link": issueDetails.link,
            "Labels": issueDetails.labels.map(label => ({"name": label})),
            "Milestone": issueDetails.milestone ? {"name": issueDetails.milestone} : undefined,
            "Project": {
              "name": issueDetails.project,
            },
          },
          "children": [
            ...fromMarkdownToBlocks(issueDetails.description),
            ...(issueDetails.comments ?? []).flatMap(comment =>
              fromMarkdownToBlocks(comment)
            )
          ]
        }
      })
    } else
      //This issue already exists in the database so we want to update the page
    {
      console.log("→ Updates issue in database");
      await notion.request({
        path:'pages/'+issuesInDatabase[issueNumber].page_id,
        method:'patch',
        body:{
          "properties": {
            "State": {"name": issueDetails.state},
            "Issue Number": parseInt(issueNumber),
            "Name": [
              {
                "text": {
                  "content" : issueDetails.title
                }
              }
            ],
            "Comments": parseInt(issueDetails.comments?.length ?? 0),
            "Link": issueDetails.link,
            "Labels": issueDetails.labels.map(label => ({"name": label})),
            "Milestone": issueDetails.milestone ? {"name": issueDetails.milestone} : undefined,
            "Project": {
              "name": issueDetails.project,
            },
          },
          "children": [
            ...fromMarkdownToBlocks(issueDetails.description),
            ...(issueDetails.comments ?? []).flatMap(comment =>
              fromMarkdownToBlocks(comment)
            )
          ]
        }
      })
    }
  }
  //Run this function every five minutes
  // setTimeout(syncIssuesWithDatabase, 5*60*1000)

  console.log("🍻 All synced!")
}

(() => syncIssuesWithDatabase())();
