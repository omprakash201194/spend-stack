$OWNER="omprakash201194"
$REPO="spend-stack"
$PROJECT_TITLE="SpendStack Roadmap"

Write-Host "Creating project..."

$project = gh project create `
  --owner $OWNER `
  --title $PROJECT_TITLE `
  --format json | ConvertFrom-Json

$PROJECT_NUMBER=$project.number

Write-Host "Project created: $PROJECT_NUMBER"

gh project edit $PROJECT_NUMBER `
  --owner $OWNER `
  --description "Roadmap and delivery board for SpendStack"

Write-Host "Linking repository..."

gh project link $PROJECT_NUMBER `
  --owner $OWNER `
  --repo "$OWNER/$REPO"

Write-Host "Creating fields..."

gh project field-create $PROJECT_NUMBER `
  --owner $OWNER `
  --name "Status" `
  --data-type SINGLE_SELECT `
  --single-select-options "Backlog,Ready,In Progress,In Review,Blocked,Done"

gh project field-create $PROJECT_NUMBER `
  --owner $OWNER `
  --name "Priority" `
  --data-type SINGLE_SELECT `
  --single-select-options "P0,P1,P2"

gh project field-create $PROJECT_NUMBER `
  --owner $OWNER `
  --name "Epic" `
  --data-type TEXT

gh project field-create $PROJECT_NUMBER `
  --owner $OWNER `
  --name "Milestone" `
  --data-type TEXT

Write-Host "Loading issues..."

$issues = gh issue list `
  --repo "$OWNER/$REPO" `
  --limit 200 `
  --json number,title,url,state,labels,milestone | ConvertFrom-Json

foreach ($issue in $issues) {

    Write-Host "Adding issue #$($issue.number)"

    $item = gh project item-add $PROJECT_NUMBER `
      --owner $OWNER `
      --url $issue.url `
      --format json | ConvertFrom-Json

}

Write-Host "All issues imported."

Write-Host ""
Write-Host "Project created:"
Write-Host "https://github.com/users/$OWNER/projects/$PROJECT_NUMBER"