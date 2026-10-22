/** BR-13 safe replacement: review exact catalog matches without deleting items. */
if (!game.user.isGM) ui.notifications.warn('Only a GM can review catalog values.');
else if (!game.osp?.openCatalogReconciliation) ui.notifications.warn('Reload the updated OSP system before opening catalog review.');
else game.osp.openCatalogReconciliation().catch(error => ui.notifications.warn(error.message));
