chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received:", request);
    if (request.action === 'organize') {
        // 创建一个异步函数来处理所有操作
        const processOrganization = async () => {
            try {
                const result = await new Promise((resolve) => {
                    chrome.storage.local.get(['lruCapacity', 'sortOrder'], resolve);
                });

                const lruCapacity = result.lruCapacity || 5;
                const sortOrder = result.sortOrder || 'recent';
                console.log("lruCapacity:", lruCapacity, "sortOrder:", sortOrder);

                const tabs = await new Promise((resolve) => {
                    chrome.tabs.query({}, resolve);
                });

                console.log("Tabs queried:", tabs);
                const normalTabs = [];
                let successCount = 0;
                let noGroupCount = 0;

                // 获取所有普通窗口中的标签页
                for (const tab of tabs) {
                    const window = await new Promise((resolve) => {
                        chrome.windows.get(tab.windowId, resolve);
                    });
                    if (window.type === 'normal') {
                        normalTabs.push(tab);
                    }
                }

                console.log("Normal tabs:", normalTabs);
                // 根据域名进行分组
                const groups = {};
                normalTabs.forEach((tab) => {
                    const url = new URL(tab.url);
                    const domainParts = url.hostname.split('.');
                    let domain;
                    
                    if (domainParts[0] === 'www') {
                        domainParts.shift();
                    }
                    
                    if (domainParts.length >= 3) {
                        domain = domainParts.slice(0, 2).join('.');
                    } else if (domainParts.length === 2) {
                        domain = domainParts[0];
                    } else {
                        domain = url.hostname;
                    }
                    
                    if (!groups[domain]) {
                        groups[domain] = [];
                    }
                    groups[domain].push({ id: tab.id, lastAccessed: tab.lastAccessed, windowId: tab.windowId });
                });

                // 对分组进行排序并限制数量
                const sortedDomains = Object.keys(groups).sort((a, b) => {
                    const lastAccessA = Math.max(...groups[a].map(tab => tab.lastAccessed));
                    const lastAccessB = Math.max(...groups[b].map(tab => tab.lastAccessed));
                    return sortOrder === 'recent' ? lastAccessB - lastAccessA : lastAccessA - lastAccessB;
                }).slice(0, lruCapacity);

                // 处理每个域名的分组
                for (const domain of sortedDomains) {
                    const tabIds = groups[domain].map(tab => tab.id);
                    if (tabIds.length > 1) {
                        const targetWindowId = groups[domain][0].windowId;

                        // 移动标签页到同一个窗口
                        for (const tabId of tabIds) {
                            try {
                                await new Promise((resolve) => {
                                    chrome.tabs.move(tabId, { windowId: targetWindowId, index: -1 }, resolve);
                                });
                            } catch (error) {
                                console.warn(`Failed to move tab ${tabId}:`, error);
                            }
                        }

                        // 创建分组
                        try {
                            const groupId = await new Promise((resolve) => {
                                chrome.tabs.group({ tabIds }, resolve);
                            });
                            await new Promise((resolve) => {
                                chrome.tabGroups.update(groupId, { title: domain }, resolve);
                            });
                            successCount++;
                        } catch (error) {
                            console.error(`Failed to create group for ${domain}:`, error);
                            noGroupCount++;
                        }
                    } else {
                        noGroupCount++;
                    }
                }

                // 返回结果
                sendResponse({
                    status: 'completed',
                    results: {
                        successCount,
                        noGroupCount,
                        totalDomains: sortedDomains.length
                    }
                });
            } catch (error) {
                console.error("Error in organization process:", error);
                sendResponse({
                    status: 'error',
                    results: {
                        successCount: 0,
                        noGroupCount: 0,
                        totalDomains: 0
                    }
                });
            }
        };

        // 启动异步处理
        processOrganization();
        return true; // 保持消息通道开放
    }
    return true;
});