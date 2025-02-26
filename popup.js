document.addEventListener('DOMContentLoaded', () => {
    const lruInput = document.getElementById('lruCapacity');

    // 加载缓存的设置
    chrome.storage.local.get(['lruCapacity', 'sortOrder'], (result) => {
        if (result.lruCapacity) {
            lruInput.value = result.lruCapacity;
        }
        if (result.sortOrder) {
            const sortOrderSelect = document.getElementById('sortOrder');
            sortOrderSelect.value = result.sortOrder;
        }
    });

    // 保存LRU容量设置
    lruInput.addEventListener('change', () => {
        const lruCapacity = parseInt(lruInput.value, 10);
        chrome.storage.local.set({ lruCapacity: lruCapacity }, () => {
            console.log(`LRU capacity set to ${lruCapacity}`);
        });
    });

    const organizeButton = document.getElementById('organize');
    const ungroupButton = document.getElementById('ungroup');

    if (organizeButton) {
        organizeButton.addEventListener('click', () => {
            console.log("Organize button clicked");
            chrome.runtime.sendMessage({ action: 'organize' }, () => {
                console.log('Message sent to background.js');
            });
        });
    }

    if (ungroupButton) {
        ungroupButton.addEventListener('click', () => {
            console.log("Ungroup button clicked");
            chrome.tabs.query({}, (tabs) => {
                const tabIds = tabs.map(tab => tab.id);
                chrome.tabs.ungroup(tabIds, () => {
                    console.log(`Tabs ungrouped`);
                });
            });
        });
    } else {
        console.log("Ungroup button not found");
    }

    const sortOrderSelect = document.getElementById('sortOrder');

    // 保存排序方式设置
    sortOrderSelect.addEventListener('change', () => {
        const sortOrder = sortOrderSelect.value;
        chrome.storage.local.set({ sortOrder: sortOrder }, () => {
            console.log(`Sort order set to ${sortOrder}`);
        });
    });
}); 