import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GaugeIcon, HeartIcon } from 'lucide-react';
import { useState } from 'react';

import { SidebarNavigation } from './SidebarNavigation';
import { SidebarNavigationItem } from './SidebarNavigationItem';

const renderSidebar = ({ isCompact = false } = {}) =>
  render(
    <SidebarNavigation isCompact={isCompact}>
      <SidebarNavigationItem
        icon={<GaugeIcon data-testid="dashboard-icon" />}
        label="Dashboard"
      />
      <SidebarNavigationItem
        icon={<HeartIcon data-testid="favorites-icon" />}
        label="Favorites"
      />
    </SidebarNavigation>,
  );

describe('SidebarNavigation', () => {
  it('(Snapshot) renders flat nav items in normal mode', () => {
    const { asFragment } = renderSidebar();
    expect(asFragment()).toMatchSnapshot();
  });

  it('(Snapshot) renders flat nav items in compact mode', () => {
    const { asFragment } = renderSidebar({ isCompact: true });
    expect(asFragment()).toMatchSnapshot();
  });

  it('sets data-testid on root element', () => {
    renderSidebar();
    expect(screen.getByTestId('sidebar-navigation')).toBeInTheDocument();
  });

  it('shows text labels in normal mode', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeVisible();
    expect(screen.getByText('Favorites')).toBeVisible();
  });

  it('hides text labels in compact mode', () => {
    renderSidebar({ isCompact: true });
    expect(screen.getByText('Dashboard')).toHaveClass('opacity-0');
    expect(screen.getByText('Favorites')).toHaveClass('opacity-0');
  });

  it('shows tooltips on hover in compact mode', async () => {
    renderSidebar({ isCompact: true });

    const items = screen.getAllByTestId('sidebar-navigation-item');
    await userEvent.hover(items[0]);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Dashboard');
  });

  it('does not show tooltips in normal mode', async () => {
    renderSidebar();

    const items = screen.getAllByTestId('sidebar-navigation-item');
    await userEvent.hover(items[0]);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('supports keyboard selection without changing the selected page on hover', async () => {
    const Sidebar = () => {
      const [selected, setSelected] = useState('Dashboard');
      return (
        <SidebarNavigation>
          {['Dashboard', 'Favorites'].map((label) => (
            <SidebarNavigationItem
              key={label}
              icon={<GaugeIcon />}
              label={label}
              isSelected={selected === label}
              onClick={() => setSelected(label)}
            />
          ))}
        </SidebarNavigation>
      );
    };
    render(<Sidebar />);
    const user = userEvent.setup();
    const dashboard = screen.getByRole('button', { name: 'Dashboard' });
    const favorites = screen.getByRole('button', { name: 'Favorites' });

    await user.tab();
    expect(dashboard).toHaveFocus();
    expect(dashboard).toHaveAttribute('aria-pressed', 'true');
    await user.hover(favorites);
    expect(dashboard).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    expect(favorites).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(favorites).toHaveAttribute('aria-pressed', 'true');
    await user.tab({ shift: true });
    await user.keyboard(' ');
    expect(dashboard).toHaveAttribute('aria-pressed', 'true');
    expect(favorites).toHaveAttribute('aria-pressed', 'false');
  });
});
