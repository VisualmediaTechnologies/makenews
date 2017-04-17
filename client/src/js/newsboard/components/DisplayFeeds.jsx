/* eslint brace-style:0*/
import React, { Component, PropTypes } from "react";
import Feed from "./Feed.jsx";
import AppWindow from "./../../utils/AppWindow";
import { connect } from "react-redux";
import * as DisplayFeedActions from "../actions/DisplayFeedActions";
import R from "ramda"; //eslint-disable-line id-length
import DisplayCollection from "./DisplayCollection";
import Spinner from "../../utils/components/Spinner";
import { WRITE_A_STORY } from "./../../header/HeaderActions";
import DisplayArticle from "./DisplayArticle";
import StringUtils from "./../../../../../common/src/util/StringUtil";
import Toast from "./../../utils/custom_templates/Toast";
import Locale from "./../../utils/Locale";

const MIN_SEARCH_KEY_LENGTH = 3;

export class DisplayFeeds extends Component {

    constructor() {
        super();
        this.state = { "expandView": false, "showCollectionPopup": false, "isFeedSelected": false, "gotNewFeeds": false, "searchToggle": false };
        this.hasMoreFeeds = true;
        this.offset = 0;
        this.key = "";
        this.comingFromCollections = false;
        this.getMoreFeeds = this.getMoreFeeds.bind(this);
        this.getFeedsCallBack = this.getFeedsCallBack.bind(this);
        this.fetchFeedsFromSources = this.fetchFeedsFromSources.bind(this);
    }

    async componentWillMount() {
        await this.autoRefresh();
    }

    async componentDidMount() {
        this.fetchFeedsFromSources(false);
        window.scrollTo(0, 0); //eslint-disable-line no-magic-numbers
        this.feedsDOM = this.refs.feeds;
        if(this.feedsDOM) {
            this.feedsDOM.addEventListener("scroll", this.getFeedsCallBack);
        }
        this.getMoreFeeds(this.props.sourceType);
        this.props.dispatch(DisplayFeedActions.clearFeeds());
    }

    componentWillReceiveProps(nextProps) {
        if(this.props.sourceType !== nextProps.sourceType) {
            this.clearState();
            this.setState({ "isFeedSelected": false });
            this.state.searchToggle && nextProps.sourceType !== "collections" ? this.searchFeeds(nextProps.sourceType) : this.getMoreFeeds(nextProps.sourceType);//eslint-disable-line no-unused-expressions
            nextProps.sourceType === "collections" ? this.setState({ "searchToggle": false }) : ""; //eslint-disable-line no-unused-expressions
        }

        if(this.props.currentFilterSource !== nextProps.currentFilterSource) {
            this.offset = 0;
        }

        if(this.props.feeds !== nextProps.feeds) {
            const [firstArticle] = nextProps.feeds;
            if (firstArticle && !firstArticle.collection && (this.offset === 0 || nextProps.sourceType === "bookmark")) { //eslint-disable-line no-magic-numbers
                this.props.dispatch(DisplayFeedActions.displayArticle(firstArticle));
            }

            if (!firstArticle) {
                this.props.dispatch(DisplayFeedActions.clearArticle());
            }
        }

        if(nextProps.sourceType === "collections" && this.props.sourceType !== nextProps.sourceType) {
            if(this.feedsDOM) {
                this.feedsDOM.removeEventListener("scroll", this.getFeedsCallBack);
            }
        }

        if(this.props.sourceType === "collections" && this.props.sourceType !== nextProps.sourceType) {
            this.comingFromCollections = true;
        }

        if(this.comingFromCollections && this.refs.feeds) {
            this.comingFromCollections = false;
            this.feedsDOM = this.refs.feeds;
            this.feedsDOM.addEventListener("scroll", this.getFeedsCallBack);
        }
    }

    componentWillUnmount() {
        if(this.feedsDOM) {
            this.feedsDOM.removeEventListener("scroll", this.getFeedsCallBack);
        }
    }

    getFeedsCallBack() {
        if (!this.timer) {
            const scrollTimeInterval = 250;
            this.timer = setTimeout(() => {
                this.timer = null;
                const scrollTop = this.feedsDOM.scrollTop;
                if (scrollTop && scrollTop + this.feedsDOM.clientHeight >= this.feedsDOM.scrollHeight) {
                    this.state.searchToggle ? this.searchFeeds(this.props.sourceType) : this.getMoreFeeds(this.props.sourceType);//eslint-disable-line no-unused-expressions
                }
            }, scrollTimeInterval);
        }
    }

    async fetchFeedsFromSources(param) {
        const hasConfiguredSources = R.pipe(
            R.values,
            R.any(sources => sources.length)
        )(this.props.configuredSources);

        if(hasConfiguredSources) {
            const response = await DisplayFeedActions.fetchFeedsFromSources(param);
            if(response) {
                this.setState({ "gotNewFeeds": true });
            }
        }
    }

    getMoreFeeds(sourceType) {
        let callback = (result) => {
            this.offset = result.docsLength ? (this.offset + result.docsLength) : this.offset;
            this.hasMoreFeeds = result.hasMoreFeeds;
        };

        if (this.hasMoreFeeds) {
            this.props.dispatch(DisplayFeedActions.fetchingFeeds(true));
            if(sourceType === "bookmark") {
                this.props.dispatch(DisplayFeedActions.getBookmarkedFeeds(this.offset, callback));
            } else if(sourceType === "collections") {
                this.props.dispatch(DisplayFeedActions.getAllCollections(this.offset, callback));
            } else {
                let filter = {};
                if(sourceType === "trending") {
                    filter.sources = this.props.currentFilterSource;
                } else {
                    filter.sources = {};
                    filter.sources[sourceType] = this.props.currentFilterSource[sourceType];
                }
                this.props.dispatch(DisplayFeedActions.displayFeedsByPage(this.offset, filter, callback));
            }
        }
    }

    _toggleFeedsView(event) {
        event.stopPropagation();
        this.setState({ "expandFeedsView": !this.state.expandFeedsView });
    }

    autoRefresh() {
        const AUTO_REFRESH_INTERVAL = AppWindow.instance().get("autoRefreshSurfFeedsInterval");
        if (!AppWindow.instance().get("autoRefreshTimer")) {
            AppWindow.instance().set("autoRefreshTimer", setInterval(this.fetchFeedsFromSources, AUTO_REFRESH_INTERVAL));
        }
    }
    _isClicked() {
        this.setState({ "isFeedSelected": !this.state.isFeedSelected });
    }

    _showMoreFeedsButton() {
        if(!["collections", "bookmark"].includes(this.props.sourceType)) {
            return (
                <button className="newsfeeds-notify" onClick={() => {
                    this.setState({ "gotNewFeeds": false });
                    this.offset = 0;
                    this.hasMoreFeeds = true;
                    this.props.dispatch(DisplayFeedActions.clearFeeds());
                    this.setState({ "searchToggle": false });
                    this.getMoreFeeds(this.props.sourceType);
                }
            }
                > Show new feeds </button>);
        }
        return null;
    }

    checkEnterKey(event) {
        const ENTERKEY = 13;
        if (event.keyCode === ENTERKEY) {
            this._search();
        }
    }

    _search() {
        const key = this.refs.searchFeeds.value.trim();
        if(!StringUtils.isEmptyString(key) && key.length >= MIN_SEARCH_KEY_LENGTH) {
            this.updateSearchState(true);
            this.clearState();
            this.searchFeeds(this.props.sourceType);
        } else {
            Toast.show("Please enter a keyword minimum of 3 characters", "search-warning");
        }
    }

    updateSearchState(currentSearchState) {
        this.setState({ "searchToggle": currentSearchState });
    }

    clearState() {
        this.searchOffset = 0;
        this.hasMoreSearchFeeds = true;
        this.hasMoreFeeds = true;
        this.offset = 0;
        this.props.dispatch(DisplayFeedActions.clearFeeds());
    }

    searchFeeds(sourceType) {
        const keyword = this.refs.searchFeeds.value;
        const callback = (result) => {
            this.searchOffset = result.docsLength ? (this.searchOffset + result.docsLength) : this.searchOffset;
            this.hasMoreSearchFeeds = result.hasMoreFeeds;
        };

        if(this.hasMoreSearchFeeds && !StringUtils.isEmptyString(keyword)) {
            this.props.dispatch(DisplayFeedActions.fetchingFeeds(true));
            this.props.dispatch(DisplayFeedActions.searchFeeds(sourceType, keyword, this.searchOffset, callback));
        }
    }

    _cancel() {
        this.updateSearchState(false);
        this.clearState();
        this.refs.searchFeeds.value = "";
        this.getMoreFeeds(this.props.sourceType);
    }

    _hide() {
        const toolTip = document.getElementById("toolTip");
        if (toolTip) {
            toolTip.style.display = "none";
        }
    }
    displayFeeds() {
        const locale = Locale.applicationStrings().messages.newsBoard;
        return (this.props.currentHeaderTab === WRITE_A_STORY && this.state.isFeedSelected
            ? <DisplayArticle articleOpen={this._isClicked.bind(this)} isStoryBoard={this.state.isFeedSelected} />
            : <div className={this.state.expandFeedsView ? "configured-feeds-container expand" : "configured-feeds-container"} onClick={() => { this._hide(); }}>
                <div className="search-bar">
                    <div className="input-box">
                        <input type="text" ref="searchFeeds"
                            onKeyUp={(event) => { this.checkEnterKey(event); }}
                            className="search-sources"
                            placeholder="Search Keywords, Articles etc."
                            title="Search Keywords, Articles etc."
                        />
                        {this.state.searchToggle
                            ? <span className="input-addon" onClick={() => { this._cancel(); }}>&times;</span>
                            : <span className="input-addon" onClick={() => { this._search(); }}><i className="fa fa-search" aria-hidden="true"/></span>
                        }
                    </div>
                </div>
                { this.state.gotNewFeeds && this._showMoreFeedsButton() }
                <i onClick={(event) => { this._toggleFeedsView(event); }} className="expand-icon" />
                <div className="feeds-container" ref="feeds">
                    <div className="feeds">
                        { this.props.feeds.map((feed, index) =>
                            <Feed feed={feed} key={index} active={feed._id === this.props.articleToDisplay._id}
                                isClicked={this._isClicked.bind(this)} dispatch={this.props.dispatch}
                            />)
                        }
                        { this.props.isFetchingFeeds
                            ? <Spinner />
                            : !this.props.feeds.length && <div className="default-message">
                                {locale[this.props.sourceType]}
                                { this.props.sourceType !== "bookmark" && <i className="fa fa-cog"/> }
                            </div>
                        }
                    </div>
                </div>
            </div>);
    }

    render() {
        return (
            this.props.sourceType === "collections" ? <DisplayCollection /> : this.displayFeeds()
        );
    }
}

function mapToStore(store) {
    return {
        "feeds": store.fetchedFeeds,
        "sourceType": store.newsBoardCurrentSourceTab,
        "articleToDisplay": store.selectedArticle,
        "currentFilterSource": store.currentFilterSource,
        "configuredSources": store.configuredSources,
        "isFetchingFeeds": store.fetchingFeeds
    };
}

DisplayFeeds.propTypes = {
    "dispatch": PropTypes.func.isRequired,
    "feeds": PropTypes.array.isRequired,
    "sourceType": PropTypes.string.isRequired,
    "articleToDisplay": PropTypes.object,
    "currentFilterSource": PropTypes.object,
    "configuredSources": PropTypes.object,
    "isFetchingFeeds": PropTypes.bool,
    "currentHeaderTab": PropTypes.string
};

export default connect(mapToStore)(DisplayFeeds);
