document.addEventListener('DOMContentLoaded', function() {
    const organizeButton = document.getElementById('organize');
    const ungroupButton = document.getElementById('ungroup');
    const lruCapacityInput = document.getElementById('lruCapacity');
    const sortOrderSelect = document.getElementById('sortOrder');

    // 保存设置
    function saveSettings() {
        const lruCapacity = parseInt(lruCapacityInput.value) || 5;
        const sortOrder = sortOrderSelect.value;
        chrome.storage.local.set({
            lruCapacity: lruCapacity,
            sortOrder: sortOrder
        });
    }

    // 显示提示
    function showNotification(message, isSuccess = true) {
        // 移除现有的提示（如果有）
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification ${isSuccess ? 'success' : 'warning'}`;
        notification.textContent = message;
        
        // 插入到按钮容器后面
        const buttonContainer = document.querySelector('.button-container');
        buttonContainer.parentNode.insertBefore(notification, buttonContainer.nextSibling);

        // 2秒后自动消失
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // 组织标签页
    organizeButton.addEventListener('click', function() {
        saveSettings();
        
        // 先取消所有现有的分组
        chrome.tabs.query({}, function(tabs) {
            const ungroupPromises = tabs.map(tab => {
                if (tab.groupId !== -1) {
                    return new Promise(resolve => {
                        chrome.tabs.ungroup(tab.id, resolve);
                    });
                }
                return Promise.resolve();
            });

            Promise.all(ungroupPromises).then(() => {
                // 取消分组后再进行组织
                chrome.runtime.sendMessage({action: 'organize'}, function(response) {
                    if (response && response.results) {
                        const {successCount, noGroupCount, totalDomains} = response.results;
                        
                        if (successCount > 0) {
                            showNotification(`成功创建 ${successCount} 个分组！`, true);
                        } else {
                            if (totalDomains === 0) {
                                showNotification('没有发现任何标签页，请打开一些网页后再试。', false);
                            } else if (noGroupCount === totalDomains) {
                                showNotification('当前标签页都是单独的域名，无法进行分组。', false);
                            } else {
                                showNotification('分组失败，请稍后重试。', false);
                            }
                        }
                    } else {
                        showNotification('操作失败，请检查浏览器权限后重试。', false);
                    }
                });
            });
        });
    });

    // 取消分组
    ungroupButton.addEventListener('click', function() {
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(function(tab) {
                if (tab.groupId !== -1) {
                    chrome.tabs.ungroup(tab.id);
                }
            });
            showNotification('已取消所有分组！');
        });
    });

    // 加载保存的设置
    chrome.storage.local.get(['lruCapacity', 'sortOrder'], function(result) {
        if (result.lruCapacity) {
            lruCapacityInput.value = result.lruCapacity;
        }
        if (result.sortOrder) {
            sortOrderSelect.value = result.sortOrder;
        }
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'showError') {
            showError(request.message);
        }
    });
}); 