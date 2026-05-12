'use client';

import React, { useState } from 'react';
import { Modal, Nav, Tab } from 'react-bootstrap';
import ParticipantMergeQueue from './participant-merge-queue';
import ConflictResolutionQueue from './conflict-resolution-queue';
import SchemaProfileAdmin from './schema-profile-admin';
import SysInfo from './system-information';
import SyncConfiguration from './sync-configuration';

interface SettingsPanelProps {
  show: boolean;
  onHide: () => void;
}

type SettingsTab =
  | 'merge'
  | 'conflicts'
  | 'profiles'
  | 'sync'
  | 'info';

const SettingsPanel: React.FC<SettingsPanelProps> = ({ show, onHide }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sync');

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      fullscreen="lg-down"
      scrollable
      aria-labelledby="settings-panel-title"
    >
      <Modal.Header closeButton>
        <Modal.Title id="settings-panel-title">
          <i className="bi bi-gear me-2" />
          Configuration &amp; Administration
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        <Tab.Container
          activeKey={activeTab}
          onSelect={(k) => k && setActiveTab(k as SettingsTab)}
        >
          <div className="d-flex h-100">
            <Nav
              variant="pills"
              className="flex-column settings-panel-nav p-3 border-end"
              style={{ minWidth: '180px' }}
            >
              <Nav.Item>
                <Nav.Link eventKey="sync" className="d-flex align-items-center gap-2">
                  <i className="bi bi-cloud-arrow-up-fill" />
                  Sync
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="merge" className="d-flex align-items-center gap-2">
                  <i className="bi bi-people-fill" />
                  Merge Queue
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="conflicts" className="d-flex align-items-center gap-2">
                  <i className="bi bi-exclamation-triangle-fill" />
                  Conflicts
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="profiles" className="d-flex align-items-center gap-2">
                  <i className="bi bi-person-badge-fill" />
                  Schema Profiles
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="info" className="d-flex align-items-center gap-2">
                  <i className="bi bi-info-circle-fill" />
                  System Info
                </Nav.Link>
              </Nav.Item>
            </Nav>
            <Tab.Content className="flex-grow-1 p-3 overflow-auto">
              <Tab.Pane eventKey="sync">
                <SyncConfiguration />
              </Tab.Pane>
              <Tab.Pane eventKey="merge">
                <ParticipantMergeQueue onBack={onHide} />
              </Tab.Pane>
              <Tab.Pane eventKey="conflicts">
                <ConflictResolutionQueue onBack={onHide} />
              </Tab.Pane>
              <Tab.Pane eventKey="profiles">
                <SchemaProfileAdmin onBack={onHide} />
              </Tab.Pane>
              <Tab.Pane eventKey="info">
                <SysInfo onBack={onHide} />
              </Tab.Pane>
            </Tab.Content>
          </div>
        </Tab.Container>
      </Modal.Body>
    </Modal>
  );
};

export default SettingsPanel;
