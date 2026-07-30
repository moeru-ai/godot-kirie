import Foundation

enum KirieHostDetachDisposition: Equatable {
    case ignored
    case restoreNow
    case waitForScene
    case waitForNextHost
}

final class KirieHostRestorationPolicy {
    private weak var activeHost: AnyObject?
    private weak var restorationScene: AnyObject?
    private(set) var isWaitingForSceneActivation = false

    func attach(host: AnyObject, scene: AnyObject?) {
        activeHost = host
        restorationScene = scene
        isWaitingForSceneActivation = false
    }

    func refreshRestorationScene(_ scene: AnyObject?, for host: AnyObject) {
        guard activeHost === host, let scene else {
            return
        }

        restorationScene = scene
    }

    func detach(host: AnyObject, canRestoreImmediately: Bool) -> KirieHostDetachDisposition {
        guard activeHost === host else {
            return .ignored
        }

        activeHost = nil
        if canRestoreImmediately {
            restorationScene = nil
            isWaitingForSceneActivation = false
            return .restoreNow
        }

        guard restorationScene != nil else {
            isWaitingForSceneActivation = false
            return .waitForNextHost
        }

        isWaitingForSceneActivation = true
        return .waitForScene
    }

    func shouldRestore(when scene: AnyObject) -> Bool {
        isWaitingForSceneActivation && restorationScene === scene
    }

    func didRestore() {
        restorationScene = nil
        isWaitingForSceneActivation = false
    }
}
