import React from 'react'
import { createRoot } from 'react-dom/client'
import { CadDiff } from '../components/diff/CadDiff'
import { Loading } from '../components/Loading'
import { Commit, DiffEntry, FileDiff, Message, MessageIds, Pull } from './types'
import {
    getGithubPullUrlParams,
    mapInjectableDiffElements,
    getGithubCommitUrlParams,
} from './web'

// https://github.com/OctoLinker/injection
// maintained by octolinker, makes sure pages that are loaded through pjax are available for injection
// no ts support
const gitHubInjection = require('github-injection')

async function injectDiff(
    owner: string,
    repo: string,
    sha: string,
    parentSha: string,
    files: DiffEntry[],
    document: Document
) {
    const map = mapInjectableDiffElements(document, files)
    for (const { element } of map) {
        createRoot(element).render(React.createElement(Loading))
    }

    for (const { element, file } of map) {
        const fileDiff = await chrome.runtime.sendMessage<Message, FileDiff>({
            id: MessageIds.GetFileDiff,
            data: { owner, repo, sha, parentSha, file },
        })
        createRoot(element).render(React.createElement(CadDiff, fileDiff))
    }
}

async function injectPullDiff(
    owner: string,
    repo: string,
    pull: number,
    document: Document
) {
    const files = await chrome.runtime.sendMessage<Message, DiffEntry[]>({
        id: MessageIds.GetGithubPullFiles,
        data: { owner, repo, pull },
    })
    const pullData = await chrome.runtime.sendMessage<Message, Pull>({
        id: MessageIds.GetGithubPull,
        data: { owner, repo, pull },
    })
    const sha = pullData.head.sha
    const parentSha = pullData.base.sha
    await injectDiff(owner, repo, sha, parentSha, files, document)
}

async function injectCommitDiff(
    owner: string,
    repo: string,
    sha: string,
    document: Document
) {
    const commit = await chrome.runtime.sendMessage<Message, Commit>({
        id: MessageIds.GetGithubCommit,
        data: { owner, repo, sha },
    })
    if (!commit.files) throw Error('Found no file changes in commit')
    if (!commit.parents.length) throw Error('Found no commit parent')
    const parentSha = commit.parents[0].sha
    injectDiff(owner, repo, sha, parentSha, commit.files, document)
}

gitHubInjection(async () => {
    const url = window.location.href
    const pullParams = getGithubPullUrlParams(url)
    if (pullParams) {
        const { owner, repo, pull } = pullParams
        await injectPullDiff(owner, repo, pull, window.document)
        return
    }

    const commitParams = getGithubCommitUrlParams(url)
    if (commitParams) {
        const { owner, repo, sha } = commitParams
        await injectCommitDiff(owner, repo, sha, window.document)
        return
    }
})
