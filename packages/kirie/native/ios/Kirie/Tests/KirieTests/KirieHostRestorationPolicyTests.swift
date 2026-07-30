import Foundation
import XCTest

final class KirieHostRestorationPolicyTests: XCTestCase {
    func testMissingWindowWaitsForTheOriginalSceneToActivate() {
        let host = NSObject()
        let originalScene = NSObject()
        let otherScene = NSObject()
        let policy = KirieHostRestorationPolicy()

        policy.attach(host: host, scene: originalScene)

        XCTAssertEqual(policy.detach(host: host, canRestoreImmediately: false), .waitForScene)
        XCTAssertTrue(policy.isWaitingForSceneActivation)
        XCTAssertFalse(policy.shouldRestore(when: otherScene))
        XCTAssertTrue(policy.shouldRestore(when: originalScene))
    }

    func testAvailableWindowRestoresImmediatelyWithoutPendingState() {
        let host = NSObject()
        let scene = NSObject()
        let policy = KirieHostRestorationPolicy()

        policy.attach(host: host, scene: scene)

        XCTAssertEqual(policy.detach(host: host, canRestoreImmediately: true), .restoreNow)
        XCTAssertFalse(policy.isWaitingForSceneActivation)
    }

    func testHostWithoutSceneWaitsForNextExplicitHost() {
        let host = NSObject()
        let unrelatedScene = NSObject()
        let policy = KirieHostRestorationPolicy()

        policy.attach(host: host, scene: nil)

        XCTAssertEqual(policy.detach(host: host, canRestoreImmediately: false), .waitForNextHost)
        XCTAssertFalse(policy.isWaitingForSceneActivation)
        XCTAssertFalse(policy.shouldRestore(when: unrelatedScene))
    }

    func testCompletedDeferredRestoreClearsPendingScene() {
        let host = NSObject()
        let scene = NSObject()
        let policy = KirieHostRestorationPolicy()

        policy.attach(host: host, scene: scene)
        XCTAssertEqual(policy.detach(host: host, canRestoreImmediately: false), .waitForScene)

        policy.didRestore()

        XCTAssertFalse(policy.isWaitingForSceneActivation)
        XCTAssertFalse(policy.shouldRestore(when: scene))
    }

    func testStaleDetachDoesNotChangeTheCurrentHost() {
        let staleHost = NSObject()
        let currentHost = NSObject()
        let scene = NSObject()
        let policy = KirieHostRestorationPolicy()

        policy.attach(host: currentHost, scene: scene)

        XCTAssertEqual(policy.detach(host: staleHost, canRestoreImmediately: false), .ignored)
        XCTAssertFalse(policy.isWaitingForSceneActivation)
    }
}
