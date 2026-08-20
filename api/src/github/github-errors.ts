// master.plan.md §3.1 — 404 "repo/kurulum silinmiş", 409/422 "sha çakışması".
// GithubAppService.request() bu hataları fırlatır; çağıran taraf (projects
// storage / controller) domain karşılığına çevirir.

export class GithubLinkBrokenError extends Error {
  constructor(message = 'github_link_broken') {
    super(message);
    this.name = 'GithubLinkBrokenError';
  }
}

export class GithubConflictError extends Error {
  constructor(
    public readonly paths: string[],
    message = 'github_conflict',
  ) {
    super(message);
    this.name = 'GithubConflictError';
  }
}
