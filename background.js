chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received:", request);
    if (request.action === 'organize') {
        chrome.storage.local.get(['lruCapacity', 'sortOrder'], (result) => {
            const lruCapacity = result.lruCapacity || 5;
            const sortOrder = result.sortOrder || 'recent';
            console.log("lruCapacity:", lruCapacity, "sortOrder:", sortOrder);
            chrome.tabs.query({}, (tabs) => {
                console.log("Tabs queried:", tabs);
                const normalTabs = [];
                let processedTabs = 0;

                tabs.forEach((tab) => {
                    chrome.windows.get(tab.windowId, (window) => {
                        console.log("Tab windowType:", window.type);
                        if (window.type === 'normal') {
                            normalTabs.push(tab);
                        }
                        processedTabs++;
                        if (processedTabs === tabs.length) {
                            console.log("Normal tabs:", normalTabs);
                            // 根据域名进行分组
                            const groups = {};
                            normalTabs.forEach((tab) => {
                                const url = new URL(tab.url);
                                const domainParts = url.hostname.split('.');
                                let domain;
                                
                                // 如果第一部分是 www，则移除它
                                if (domainParts[0] === 'www') {
                                    domainParts.shift();
                                }
                                
                                if (domainParts.length >= 3) {
                                    // 对于类似 sub.example.com 的域名，取 sub.example
                                    domain = domainParts.slice(0, 2).join('.');
                                } else if (domainParts.length === 2) {
                                    // 对于类似 example.com 的域名，取 example
                                    domain = domainParts[0];
                                } else {
                                    // 处理特殊情况，如 localhost
                                    domain = url.hostname;
                                }
                                
                                if (!groups[domain]) {
                                    groups[domain] = [];
                                }
                                groups[domain].push({ id: tab.id, lastAccessed: tab.lastAccessed, windowId: tab.windowId });
                            });

                            console.log("Groups formed:", groups);
                            // 对分组进行排序并限制数量
                            const sortedDomains = Object.keys(groups).sort((a, b) => {
                                const lastAccessA = Math.max(...groups[a].map(tab => tab.lastAccessed));
                                const lastAccessB = Math.max(...groups[b].map(tab => tab.lastAccessed));
                                return sortOrder === 'recent' ? lastAccessB - lastAccessA : lastAccessA - lastAccessB;
                            }).slice(0, lruCapacity);

                            console.log("Sorted domains:", sortedDomains);
                            // 创建分组
                            const createGroup = async (domain) => {
                                try {
                                    // 获取所有在普通窗口中的标签页
                                    const tabsInNormalWindow = await Promise.all(
                                        groups[domain].map(async (tab) => {
                                            return new Promise((resolve) => {
                                                chrome.windows.get(tab.windowId, (window) => {
                                                    if (window.type === 'normal') {
                                                        resolve(tab);
                                                    } else {
                                                        resolve(null);
                                                    }
                                                });
                                            });
                                        })
                                    );

                                    // 过滤掉 null 值并获取标签页 ID
                                    const validTabs = tabsInNormalWindow.filter(tab => tab !== null);
                                    const tabIds = validTabs.map(tab => tab.id);

                                    if (tabIds.length > 1) {
                                        const targetWindowId = validTabs[0].windowId;

                                        // 移动标签页到同一个窗口
                                        const movedTabs = await Promise.all(
                                            tabIds.map(tabId =>
                                                new Promise(resolve => {
                                                    chrome.tabs.move(tabId, { windowId: targetWindowId, index: -1 }, () => {
                                                        if (chrome.runtime.lastError) {
                                                            console.warn(`Failed to move tab ${tabId}:`, chrome.runtime.lastError);
                                                            resolve(false);
                                                        } else {
                                                            resolve(true);
                                                        }
                                                    });
                                                })
                                            )
                                        );

                                        // 过滤出成功移动的标签页
                                        const successfullyMovedTabs = tabIds.filter((_, index) => movedTabs[index]);

                                        if (successfullyMovedTabs.length > 1) {
                                            chrome.tabs.group({ tabIds: successfullyMovedTabs }, (groupId) => {
                                                if (!chrome.runtime.lastError) {
                                                    console.log("Group created with ID:", groupId);
                                                    chrome.tabGroups.update(groupId, { title: domain }, () => {
                                                        console.log("Group updated with title:", domain);
                                                    });
                                                } else {
                                                    console.error("Failed to create group:", chrome.runtime.lastError);
                                                }
                                            });
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Error processing group for ${domain}:`, error);
                                }
                            };

                            // 修改分组创建逻辑
                            sortedDomains.forEach(domain => {
                                createGroup(domain);
                            });
                        }
                    });
                });
            });
        });
        sendResponse({ status: 'completed' });
    }
    return true;
});