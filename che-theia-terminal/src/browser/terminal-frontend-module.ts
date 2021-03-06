/*********************************************************************
 * Copyright (c) 2018 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/

import { ContainerModule, Container, interfaces } from 'inversify';
import { WidgetFactory, WebSocketConnectionProvider, KeybindingContext } from '@theia/core/lib/browser';
import { TerminalQuickOpenService } from './contribution/terminal-quick-open';
import { RemoteTerminalWidgetOptions, REMOTE_TERMINAL_WIDGET_FACTORY_ID } from './terminal-widget/remote-terminal-widget';
import { RemoteWebSocketConnectionProvider } from './server-definition/remote-connection';
import { TerminalProxyCreator, TerminalProxyCreatorProvider, TerminalApiEndPointProvider } from './server-definition/terminal-proxy-creator';

import '../../src/browser/terminal-widget/terminal.css';
import 'xterm/lib/xterm.css';
import { cheWorkspaceServicePath, CHEWorkspaceService } from '../common/workspace-service';
import {ExecTerminalFrontendContribution} from './contribution/exec-terminal-contribution';
import {TerminalFrontendContribution} from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget, TerminalWidgetOptions } from '@theia/terminal/lib/browser/base/terminal-widget';
import { RemoteTerminalWidget } from './terminal-widget/remote-terminal-widget';
import { RemoteTerminaActiveKeybingContext } from './contribution/keybinding-context';
import { RemoteTerminalServerProxy, RemoteTerminalServer, RemoteTerminalWatcher } from './server-definition/remote-terminal-protocol';

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind)  => {
    bind(KeybindingContext).to(RemoteTerminaActiveKeybingContext).inSingletonScope();

    bind(RemoteTerminalWidget).toSelf();

    bind(TerminalQuickOpenService).toSelf().inSingletonScope();

    bind(ExecTerminalFrontendContribution).toSelf().inSingletonScope();

    rebind(TerminalFrontendContribution).toService(ExecTerminalFrontendContribution);

    bind(RemoteWebSocketConnectionProvider).toSelf();
    bind(TerminalProxyCreator).toSelf().inSingletonScope();

    bind(RemoteTerminalServer).toService(RemoteTerminalServerProxy);

    bind(RemoteTerminalWatcher).toSelf().inSingletonScope();

    let terminalNum = 0;
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: REMOTE_TERMINAL_WIDGET_FACTORY_ID,
        createWidget: (options: RemoteTerminalWidgetOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            const counter = terminalNum++;
            const domId = options.id || 'terminal-' + counter;

            const widgetOptions: RemoteTerminalWidgetOptions = {
                title: options.machineName + ' terminal ' + counter,
                useServerTitle: true,
                destroyTermOnClose: true,
                ...options
            };
            child.bind(TerminalWidgetOptions).toConstantValue(widgetOptions);
            child.bind(RemoteTerminalWidgetOptions).toConstantValue(widgetOptions);
            child.bind('terminal-dom-id').toConstantValue(domId);

            return child.get(RemoteTerminalWidget);
        }
    }));

    bind(CHEWorkspaceService).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<CHEWorkspaceService>(cheWorkspaceServicePath);
    }).inSingletonScope();

    bind<TerminalApiEndPointProvider>('TerminalApiEndPointProvider').toProvider<string>((context) => {
        return () => {
            return new Promise<string>((resolve, reject) => {
                const workspaceService = context.container.get<CHEWorkspaceService>(CHEWorkspaceService);

                workspaceService.findTerminalServer().then(server => {
                    if (server) {
                        bind(TerminalWidget).to(RemoteTerminalWidget).inTransientScope();
                        rebind(TerminalService).toService(TerminalQuickOpenService);

                        return resolve(server.url);
                    }
                    return resolve(undefined);
                }).catch(err => {
                    console.error('Failed to get remote terminal server api end point url. Cause: ', err);
                    resolve(undefined);
                });
            });
        };
    });

    bind<TerminalProxyCreatorProvider>('TerminalProxyCreatorProvider').toProvider<TerminalProxyCreator>((context) => {
        return () => {
            return new Promise<TerminalProxyCreator>((resolve, reject) => {
                const provider = context.container.get<TerminalApiEndPointProvider>('TerminalApiEndPointProvider');
                provider().then(url => {
                    if (url) {
                        context.container.bind('term-api-end-point').toConstantValue(url);
                        return resolve(context.container.get(TerminalProxyCreator));
                    }
                    return reject('Unabel to find che-machine-exec server.');
                }).catch(err => {
                    console.log('Failed to get terminal proxy. Cause: ', err);
                    return reject(err);
                });
            });
        };
    });
});
