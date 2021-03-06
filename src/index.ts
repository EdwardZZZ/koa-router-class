import * as Koa from 'koa';
import { pathToRegexp, Key } from 'path-to-regexp';

import { loadDir, replaceTailSlash } from './utils';
import controllerInfo from './utils/ControllerInfo';
import Require from './utils/Require';
import { callMethod } from './utils/callMethod';

import { TPathInfo } from './typings/TPathInfo';
import { IContext } from './typings/IContext';
import { context } from './extends/Context';
import { response } from './extends/Response';
import { request } from './extends/Request';
import expansion from './extends';

export { default as BaseController } from './core/BaseController';
export { Path, RequestMethod } from './decorators/Path';
export { Resource, Inject } from './decorators/Resource';
export { Around, middlewareToAround } from './decorators/Around';
export { createArgDecorator, Query, Param, Context } from './decorators/ArgDecorator';
export { expansion };

export function Router({ ROOT, app }: {
    ROOT: string,
    app: Koa,
}) {
    expansion(app, { context, request, response });
    loadDir(ROOT, (fileName) => {
        Require.default(fileName);
    });

    const StaticRouterMap: Map<String, TPathInfo> = new Map();
    const RegexpRouterMap: Map<RegExp, TPathInfo> = new Map();
    const RoutePathSet: Set<string> = new Set();

    for (const info of controllerInfo.getControllersInfo()) {
        const { clazz, root = '', methodMap } = info;

        if (!methodMap) continue;

        for (const [methodName, methodInfo] of methodMap) {
            const { paths } = methodInfo;

            paths.forEach(({ path: p, methodTypes }) => {
                const routePath = replaceTailSlash(root + p) || '/';

                if (RoutePathSet.has(routePath)) return console.log(`[URL NOT UNIQUE] ${routePath}`);
                console.log(`[URL]${routePath}`);
                RoutePathSet.add(routePath);

                if (p.indexOf(':') > -1 || p.indexOf('(') > -1) {
                    const keys: Key[] = [];
                    const pathReg = pathToRegexp(routePath, keys);

                    RegexpRouterMap.set(pathReg, { clazz, keys, routePath, methodTypes, methodName });
                } else {
                    StaticRouterMap.set(routePath, { clazz, routePath, methodTypes, methodName });
                }
            });
        }
    }

    function MatchRegexp(reqPath: string) {
        for (const [reg, { clazz, methodName, keys, methodTypes }] of RegexpRouterMap) {
            const result = reg.exec(reqPath);

            if (result) {
                // mixin keys and params
                const params = {};
                const paramArr = result.slice(1);

                keys.forEach((k, i) => {
                    params[k.name] = paramArr[i];
                });

                return { clazz, methodName, params, methodTypes };
            }
        }

        return false;
    }

    return (ctx: IContext, next: Function) => {
        const { method: methodType } = ctx.request;
        const reqPath = replaceTailSlash(ctx.request.path) || '/';

        const staticResult = StaticRouterMap.get(reqPath);

        if (staticResult && (!staticResult.methodTypes || staticResult.methodTypes.indexOf(methodType) > -1)) {
            const { clazz, methodName } = staticResult;

            return callMethod(clazz, methodName, {}, ctx, next);
        }

        const regexpResult = MatchRegexp(reqPath);

        if (regexpResult && (!regexpResult.methodTypes || regexpResult.methodTypes.indexOf(methodType) > -1)) {
            const { clazz, methodName, params = {} } = regexpResult;

            return callMethod(clazz, methodName, params, ctx, next);
        }

        return next();
    };
}
