import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { flexRender, Row } from '@tanstack/react-table';

import { Track } from '@nuclearplayer/model';

import { cn } from '../../utils';
import { useTrackTableContext } from './TrackTableContext';

type SortableRowProps<T extends Track = Track> = {
  row: Row<T>;
  itemId: string;
  isReorderable?: boolean;
  style?: React.CSSProperties;
};

export function SortableRow<T extends Track = Track>({
  row,
  itemId,
  isReorderable = false,
  style: externalStyle,
}: SortableRowProps<T>) {
  const { actions } = useTrackTableContext<T>();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemId,
    disabled: !isReorderable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...externalStyle,
  };

  return (
    <tr
      data-testid="track-row"
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-border bg-muted group border-b-(length:--border-width) select-none',
        {
          '': !isDragging,
          'z-50': isDragging,
          'cursor-grab': isReorderable,
          'cursor-pointer': Boolean(actions?.onPlayNow) && !isReorderable,
          'hover:bg-secondary focus-visible:outline-primary focus-visible:outline-2 focus-visible:-outline-offset-2':
            Boolean(actions?.onPlayNow),
        },
      )}
      {...attributes}
      {...listeners}
      role="row"
      tabIndex={actions?.onPlayNow || isReorderable ? 0 : undefined}
      aria-disabled={undefined}
      aria-roledescription={
        isReorderable ? attributes['aria-roledescription'] : undefined
      }
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          isDragging ||
          !(event.target instanceof Element) ||
          !event.currentTarget.contains(event.target) ||
          event.target.closest(
            'button, a, input, select, textarea, [role="button"], [role="menuitem"], [contenteditable="true"]',
          )
        ) {
          return;
        }
        actions?.onPlayNow?.(row.original);
      }}
      onKeyDown={(event) => {
        if (
          event.target !== event.currentTarget ||
          event.repeat ||
          isDragging ||
          !actions?.onPlayNow ||
          (event.key !== 'Enter' && event.key !== ' ')
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        actions.onPlayNow(row.original);
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <Cell key={cell.id} cell={cell} />
      ))}
    </tr>
  );
}

type CellProps<T extends Track> = {
  cell: ReturnType<Row<T>['getVisibleCells']>[number];
};

const Cell = <T extends Track>({ cell }: CellProps<T>) => {
  return flexRender(cell.column.columnDef.cell, cell.getContext());
};
