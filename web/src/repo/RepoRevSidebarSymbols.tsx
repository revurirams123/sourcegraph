import * as H from 'history'
import { isEqual } from 'lodash'
import * as React from 'react'
import { NavLink } from 'react-router-dom'
import { Observable } from 'rxjs'
import * as GQL from '../../../shared/src/graphql/schema'
import { SymbolIcon } from '../../../shared/src/symbols/SymbolIcon'
import { FilteredConnection } from '../components/FilteredConnection'
import { fetchSymbols } from '../symbols/backend'
import { parseBrowserRepoURL } from '../util/url'

function symbolIsActive(symbolLocation: string, currentLocation: H.Location): boolean {
    const current = parseBrowserRepoURL(H.createPath(currentLocation))
    const symbol = parseBrowserRepoURL(symbolLocation)
    return (
        current.repoName === symbol.repoName &&
        current.rev === symbol.rev &&
        current.filePath === symbol.filePath &&
        isEqual(current.position, symbol.position)
    )
}

const symbolIsActiveTrue = () => true
const symbolIsActiveFalse = () => false

interface SymbolNodeProps {
    node: GQL.ISymbol
    location: H.Location
}

const SymbolNode: React.FunctionComponent<SymbolNodeProps> = ({ node, location }) => {
    const isActiveFunc = symbolIsActive(node.url, location) ? symbolIsActiveTrue : symbolIsActiveFalse
    return (
        <li className="repo-rev-sidebar-symbols-node">
            <NavLink
                to={node.url}
                isActive={isActiveFunc}
                className="repo-rev-sidebar-symbols-node__link"
                activeClassName="repo-rev-sidebar-symbols-node__link--active"
            >
                <SymbolIcon kind={node.kind} className="icon-inline mr-1" />
                <span className="repo-rev-sidebar-symbols-node__name">{node.name}</span>
                {node.containerName && (
                    <span className="repo-rev-sidebar-symbols-node__container-name">
                        <small>{node.containerName}</small>
                    </span>
                )}
                <span className="repo-rev-sidebar-symbols-node__path">
                    <small>{node.location.resource.path}</small>
                </span>
            </NavLink>
        </li>
    )
}

class FilteredSymbolsConnection extends FilteredConnection<GQL.ISymbol, Pick<SymbolNodeProps, 'location'>> {}

interface Props {
    repoID: GQL.ID
    rev: string | undefined
    history: H.History
    location: H.Location
}

export class RepoRevSidebarSymbols extends React.PureComponent<Props> {
    public render(): JSX.Element | null {
        return (
            <FilteredSymbolsConnection
                className="repo-rev-sidebar-symbols"
                compact={true}
                noun="symbol"
                pluralNoun="symbols"
                queryConnection={this.fetchSymbols}
                nodeComponent={SymbolNode}
                nodeComponentProps={{ location: this.props.location } as Pick<SymbolNodeProps, 'location'>}
                defaultFirst={100}
                shouldUpdateURLQuery={false}
                history={this.props.history}
                location={this.props.location}
            />
        )
    }

    private fetchSymbols = (args: { first?: number; query?: string }): Observable<GQL.ISymbolConnection> =>
        fetchSymbols(this.props.repoID, this.props.rev || '', args)
}
