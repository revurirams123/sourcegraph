import { LoadingSpinner } from '@sourcegraph/react-loading-spinner'
import { decode } from 'he'
import _ from 'lodash'
import { range } from 'lodash'
import React from 'react'
import { Link } from 'react-router-dom'
import VisibilitySensor from 'react-visibility-sensor'
import { combineLatest, of, Subject, Subscription } from 'rxjs'
import { catchError, filter, switchMap } from 'rxjs/operators'
import sanitizeHtml from 'sanitize-html'
import { Markdown } from '../../../shared/src/components/Markdown'
import * as GQL from '../../../shared/src/graphql/schema'
import { highlightNode } from '../../../shared/src/util/dom'
import { renderMarkdown } from '../discussions/backend'
import { highlightCode } from '../search/backend'
import { HighlightRange } from './SearchResult'

interface SearchResultMatchProps {
    item: GQL.ISearchMatch
    body: GQL.IMarkdown
    url: string
    highlightRanges: HighlightRange[]
    isLightTheme: boolean
}

interface SearchResultMatchState {
    HTML?: string
}

export class SearchResultMatch extends React.Component<SearchResultMatchProps, SearchResultMatchState> {
    public state: SearchResultMatchState = {}
    private tableContainerElement: HTMLElement | null = null
    private visibilitySensorOffset = { bottom: -500 }

    private visibilityChanges = new Subject<boolean>()
    private subscriptions = new Subscription()
    private propsChanges = new Subject<SearchResultMatchProps>()

    private getLanguage(): string | undefined {
        const matches = /(?:```)([^\s]+)\s/.exec(this.props.body.text)
        if (!matches) {
            return undefined
        }
        return matches[1]
    }

    private bodyIsCode(): boolean {
        return this.props.body.text.startsWith('```') && this.props.body.text.endsWith('```')
    }

    public constructor(props: SearchResultMatchProps) {
        super(props)

        // Render the match body as markdown, and syntax highlight the response if it's a code block.
        // This is a lot of network requests right now, but once extensions can run on the backend we can
        // run results through the renderer and syntax highlighter without network requests.
        this.subscriptions.add(
            combineLatest(this.propsChanges, this.visibilityChanges)
                .pipe(
                    filter(([, isVisible]) => isVisible),
                    switchMap(
                        ([props]) =>
                            props.body.html !== ''
                                ? of(sanitizeHtml(props.body.html))
                                : renderMarkdown({ markdown: props.body.text })
                    ),
                    switchMap(markdownHTML => {
                        if (this.bodyIsCode() && markdownHTML.includes('<code') && markdownHTML.includes('</code>')) {
                            const lang = this.getLanguage() || 'txt'
                            const parser = new DOMParser()
                            // Get content between the outermost code tags.
                            const codeContent = parser
                                .parseFromString(markdownHTML, 'text/html')
                                .querySelector('code')!
                                .innerHTML.toString()
                            if (codeContent) {
                                return highlightCode({
                                    code: decode(codeContent),
                                    fuzzyLanguage: lang,
                                    disableTimeout: false,
                                    isLightTheme: this.props.isLightTheme,
                                }).pipe(
                                    switchMap(highlightedStr => {
                                        const highlightedMarkdown = markdownHTML.replace(codeContent, highlightedStr)
                                        return of(highlightedMarkdown)
                                    }),
                                    // Return the rendered markdown if highlighting fails.
                                    catchError(() => of(markdownHTML))
                                )
                            }
                        }
                        return of(markdownHTML)
                    }),
                    // Return the raw body if markdown rendering fails, maintaing the text structure.
                    catchError(() => of('<pre>' + sanitizeHtml(props.body.text) + '</pre>'))
                )
                .subscribe(str => this.setState({ HTML: str }), error => console.error(error))
        )
    }

    public componentDidMount(): void {
        this.propsChanges.next(this.props)
        this.highlightNodes()
    }

    public componentDidUpdate(): void {
        this.highlightNodes()
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    private highlightNodes(): void {
        if (this.tableContainerElement) {
            const visibleRows = this.tableContainerElement.querySelectorAll('table tr')
            if (visibleRows.length > 0) {
                for (const h of this.props.highlightRanges) {
                    const code = visibleRows[h.line - 1]
                    if (code) {
                        highlightNode(code as HTMLElement, h.character, h.length)
                    }
                }
            }
        }
    }

    private onChangeVisibility = (isVisible: boolean): void => {
        this.visibilityChanges.next(isVisible)
    }

    private getFirstLine(): number {
        return Math.max(0, Math.min(...this.props.highlightRanges.map(r => r.line)) - 1)
    }

    private getLastLine(): number {
        const lastLine = Math.max(...this.props.highlightRanges.map(r => r.line)) + 1
        return this.props.highlightRanges ? Math.min(lastLine, this.props.highlightRanges.length) : lastLine
    }

    public render(): JSX.Element {
        const firstLine = this.getFirstLine()
        let lastLine = this.getLastLine()
        if (firstLine === lastLine) {
            // Some edge cases yield the same first and last line, causing the visibility sensor to break, so make sure to avoid this.
            lastLine++
        }

        return (
            <VisibilitySensor
                active={true}
                onChange={this.onChangeVisibility}
                partialVisibility={true}
                offset={this.visibilitySensorOffset}
            >
                <>
                    {this.state.HTML && (
                        <Link key={this.props.url} to={this.props.url} className="search-result-match">
                            <Markdown
                                refFn={this.setTableContainerElement}
                                className={`search-result-match__markdown ${
                                    this.bodyIsCode() ? 'search-result-match__code-excerpt' : ''
                                }`}
                                dangerousInnerHTML={this.state.HTML}
                            />
                        </Link>
                    )}
                    {!this.state.HTML && (
                        <>
                            <LoadingSpinner className="icon-inline search-result-match__loader" />
                            <table>
                                <tbody>
                                    {range(firstLine, lastLine).map(i => (
                                        <tr key={i}>
                                            {/* create empty space to fill viewport (as if the blob content were already fetched, otherwise we'll overfetch) */}
                                            <td className="line search-result-match__line--hidden">
                                                <code>{i}</code>
                                            </td>
                                            <td className="code"> </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </>
            </VisibilitySensor>
        )
    }

    private setTableContainerElement = (ref: HTMLElement | null) => {
        this.tableContainerElement = ref
    }
}