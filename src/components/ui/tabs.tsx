// Scaffold placeholder for shadcn/ui tabs
import type { ComponentPropsWithoutRef } from 'react';
import { buttonClassName } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Tabs(props: ComponentPropsWithoutRef<'div'>) {
	return <div {...props} />;
}

export function TabsList(props: ComponentPropsWithoutRef<'div'>) {
	return <div {...props} />;
}

export function TabsTrigger(props: ComponentPropsWithoutRef<'button'>) {
	const { className, ...rest } = props;
	return (
		<button
			type="button"
			className={cn(buttonClassName({ variant: 'ghost', size: 'sm' }), className)}
			{...rest}
		/>
	);
}

export function TabsContent(props: ComponentPropsWithoutRef<'div'>) {
	return <div {...props} />;
}
