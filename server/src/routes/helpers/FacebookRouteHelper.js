/* eslint consistent-this:0 no-unused-vars:0*/
"use strict";
import moment from "moment";
import HttpResponseHandler from "../../../../common/src/HttpResponseHandler.js";
import StringUtil from "../../../../common/src/util/StringUtil";
import FacebookRequestHandler from "../../facebook/FacebookRequestHandler.js";
import ResponseUtil from "../../util/ResponseUtil";

export default class FacebookRouteHelper {
    constructor(request, response) {
        this.request = request;
        this.response = response;
    }

    pageRouter() {
        let webUrl = this.request.query.webUrl;
        let accessTokenName = this.request.query.accessToken;
        let since = this.request.query.since;
        if(StringUtil.isEmptyString(webUrl) || StringUtil.isEmptyString(accessTokenName) || (since && !moment(since).isValid())) {
            ResponseUtil.setResponse(this.response, HttpResponseHandler.codes.BAD_REQUEST, "bad request");
            return;
        }
        let options = {};
        if(since) {
            options.since = moment(since).toISOString();
        }
        FacebookRequestHandler.instance(accessTokenName).pagePosts(webUrl, options).then(feeds => {
            ResponseUtil.setResponse(this.response, HttpResponseHandler.codes.OK, { "posts": feeds });
        }).catch(error => {
            ResponseUtil.setResponse(this.response, HttpResponseHandler.codes.INTERNAL_SERVER_ERROR, error);
        });
    }

    fetchMultiplePages() {
        let accessTokenName = this.request.body.accessToken;
        let facebookRequestHandler = FacebookRequestHandler.instance(accessTokenName);

        let allFeeds = {};
        let counter = 0;
        this.request.body.data.forEach((item)=> {

            let options = {};
            if(item.timestamp) {
                options.since = moment(item.timestamp).toISOString();
            }
            facebookRequestHandler.pagePosts(item.url, options).then(feeds => {
                allFeeds[item.id] = feeds;
                if(this.request.body.data.length - 1 === counter) {
                    ResponseUtil.setResponse(this.response, HttpResponseHandler.codes.OK, { "posts": allFeeds });
                }
                counter += 1;
            }).catch(() => {
                allFeeds[item.id] = "failed";
                if (this.request.body.data.length - 1 === counter) {
                    ResponseUtil.setResponse(this.response, HttpResponseHandler.codes.OK, { "posts": allFeeds });
                }
                counter += 1;
            });
        });
    }
}
